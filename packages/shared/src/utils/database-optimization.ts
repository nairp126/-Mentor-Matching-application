import { Pool, PoolClient } from 'pg';
import { CacheUtils } from './cache';
import { PerformanceUtils, DatabasePerformance } from './performance';

/**
 * Database optimization utilities for improved performance
 */
export class DatabaseOptimization {
  private static pool: Pool;
  private static queryCache = new Map<string, any>();
  private static preparedStatements = new Map<string, string>();

  /**
   * Initialize optimized database connection pool
   */
  static initializePool(config: any): void {
    this.pool = new Pool({
      ...config,
      // Connection pool optimization
      max: 20, // Maximum number of clients in the pool
      min: 5,  // Minimum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection could not be established
      maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
      
      // Performance optimizations
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      
      // Error handling
      allowExitOnIdle: true
    });

    // Monitor pool events
    this.pool.on('connect', (client) => {
      console.log('Database: New client connected');
      // Set session-level optimizations
      client.query('SET statement_timeout = 30000'); // 30 second timeout
      client.query('SET lock_timeout = 10000'); // 10 second lock timeout
    });

    this.pool.on('error', (err) => {
      console.error('Database pool error:', err);
    });

    // Setup periodic pool monitoring
    setInterval(() => {
      DatabasePerformance.recordConnectionMetrics({
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      });
    }, 60000);
  }

  /**
   * Get optimized database connection
   */
  static getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database pool not initialized. Call initializePool() first.');
    }
    return this.pool;
  }

  /**
   * Execute query with performance monitoring and caching
   */
  static async query<T = any>(
    text: string,
    params?: any[],
    options: QueryOptions = {}
  ): Promise<QueryResult<T>> {
    const {
      cache = false,
      cacheTTL = 300,
      cacheKey,
      timeout = 30000,
      retries = 1,
      name
    } = options;

    const queryName = name || this.generateQueryName(text);
    const finalCacheKey = cacheKey || this.generateCacheKey(text, params);

    // Try cache first if enabled
    if (cache) {
      const cached = await CacheUtils.get<QueryResult<T>>(finalCacheKey);
      if (cached) {
        PerformanceUtils.recordMetric(`db_cache_hit_${queryName}`, 1, 'count');
        return cached;
      }
      PerformanceUtils.recordMetric(`db_cache_miss_${queryName}`, 1, 'count');
    }

    // Execute query with monitoring
    const result = await DatabasePerformance.monitorQuery(queryName, async () => {
      return await this.executeQueryWithRetry(text, params, timeout, retries);
    });

    // Cache result if enabled
    if (cache && result.rows.length > 0) {
      await CacheUtils.set(finalCacheKey, result, cacheTTL);
    }

    return result;
  }

  /**
   * Execute query with retry logic
   */
  private static async executeQueryWithRetry<T = any>(
    text: string,
    params?: any[],
    timeout: number = 30000,
    retries: number = 1
  ): Promise<QueryResult<T>> {
    let lastError: Error;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const client = await this.pool.connect();
        
        try {
          // Set query timeout
          await client.query(`SET statement_timeout = ${timeout}`);
          
          const result = await client.query(text, params);
          return {
            rows: result.rows,
            rowCount: result.rowCount || 0,
            command: result.command,
            fields: result.fields
          };
        } finally {
          client.release();
        }
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry for certain types of errors
        if (this.isNonRetryableError(error)) {
          break;
        }
        
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Check if error should not be retried
   */
  private static isNonRetryableError(error: any): boolean {
    const nonRetryableCodes = [
      '23505', // unique_violation
      '23503', // foreign_key_violation
      '23502', // not_null_violation
      '23514', // check_violation
      '42P01', // undefined_table
      '42703', // undefined_column
      '42883', // undefined_function
      '42601'  // syntax_error
    ];

    return nonRetryableCodes.includes(error.code);
  }

  /**
   * Execute transaction with optimizations
   */
  static async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const { isolationLevel = 'READ COMMITTED', timeout = 30000 } = options;
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
      await client.query(`SET statement_timeout = ${timeout}`);
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Batch insert with optimization
   */
  static async batchInsert<T>(
    table: string,
    columns: string[],
    data: T[][],
    options: BatchInsertOptions = {}
  ): Promise<void> {
    const { batchSize = 1000, onConflict } = options;
    
    if (data.length === 0) return;

    const batches = this.chunkArray(data, batchSize);
    
    for (const batch of batches) {
      const placeholders = batch.map((_, rowIndex) => {
        const rowPlaceholders = columns.map((_, colIndex) => {
          return `$${rowIndex * columns.length + colIndex + 1}`;
        });
        return `(${rowPlaceholders.join(', ')})`;
      }).join(', ');

      const values = batch.flat();
      let query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;
      
      if (onConflict) {
        query += ` ON CONFLICT ${onConflict}`;
      }

      await this.query(query, values, { name: `batch_insert_${table}` });
    }
  }

  /**
   * Bulk update with optimization
   */
  static async bulkUpdate<T>(
    table: string,
    updates: Array<{ where: Record<string, any>; set: Record<string, any> }>,
    options: BulkUpdateOptions = {}
  ): Promise<void> {
    const { batchSize = 100 } = options;
    
    if (updates.length === 0) return;

    const batches = this.chunkArray(updates, batchSize);
    
    for (const batch of batches) {
      await this.transaction(async (client) => {
        for (const update of batch) {
          const setClause = Object.keys(update.set)
            .map((key, index) => `${key} = $${index + 1}`)
            .join(', ');
          
          const whereClause = Object.keys(update.where)
            .map((key, index) => `${key} = $${Object.keys(update.set).length + index + 1}`)
            .join(' AND ');
          
          const values = [...Object.values(update.set), ...Object.values(update.where)];
          const query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
          
          await client.query(query, values);
        }
      });
    }
  }

  /**
   * Paginated query with optimization
   */
  static async paginatedQuery<T>(
    baseQuery: string,
    params: any[],
    page: number,
    limit: number,
    options: PaginatedQueryOptions = {}
  ): Promise<PaginatedResult<T>> {
    const { countQuery, cache = false, cacheTTL = 300 } = options;
    
    const offset = (page - 1) * limit;
    const paginatedQuery = `${baseQuery} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const paginatedParams = [...params, limit, offset];

    // Execute count and data queries in parallel
    const [countResult, dataResult] = await Promise.all([
      countQuery 
        ? this.query(countQuery, params, { cache, cacheTTL, name: 'paginated_count' })
        : this.query(`SELECT COUNT(*) FROM (${baseQuery}) as count_query`, params, { cache, cacheTTL, name: 'paginated_count' }),
      this.query<T>(paginatedQuery, paginatedParams, { cache, cacheTTL, name: 'paginated_data' })
    ]);

    const total = parseInt(countResult.rows[0].count);
    
    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Search with full-text search optimization
   */
  static async fullTextSearch<T>(
    table: string,
    searchColumns: string[],
    searchTerm: string,
    options: FullTextSearchOptions = {}
  ): Promise<QueryResult<T>> {
    const {
      additionalWhere = '',
      orderBy = 'ts_rank DESC',
      limit = 50,
      language = 'english'
    } = options;

    const searchVector = searchColumns
      .map(col => `to_tsvector('${language}', ${col})`)
      .join(' || ');
    
    const query = `
      SELECT *, ts_rank(${searchVector}, plainto_tsquery('${language}', $1)) as rank
      FROM ${table}
      WHERE ${searchVector} @@ plainto_tsquery('${language}', $1)
      ${additionalWhere ? `AND ${additionalWhere}` : ''}
      ORDER BY ${orderBy}
      LIMIT ${limit}
    `;

    return this.query<T>(query, [searchTerm], {
      cache: true,
      cacheTTL: 600,
      name: `fulltext_search_${table}`
    });
  }

  /**
   * Analyze query performance
   */
  static async analyzeQuery(query: string, params?: any[]): Promise<QueryAnalysis> {
    const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
    const result = await this.query(explainQuery, params);
    
    const plan = result.rows[0]['QUERY PLAN'][0];
    
    return {
      executionTime: plan['Execution Time'],
      planningTime: plan['Planning Time'],
      totalCost: plan.Plan['Total Cost'],
      actualRows: plan.Plan['Actual Rows'],
      estimatedRows: plan.Plan['Plan Rows'],
      bufferHits: plan.Plan['Shared Hit Blocks'] || 0,
      bufferReads: plan.Plan['Shared Read Blocks'] || 0,
      recommendations: this.generateQueryRecommendations(plan)
    };
  }

  /**
   * Generate query optimization recommendations
   */
  private static generateQueryRecommendations(plan: any): string[] {
    const recommendations: string[] = [];
    
    // Check for sequential scans
    if (plan.Plan['Node Type'] === 'Seq Scan') {
      recommendations.push('Consider adding an index to avoid sequential scan');
    }
    
    // Check for high cost operations
    if (plan.Plan['Total Cost'] > 1000) {
      recommendations.push('High cost query detected. Consider optimization');
    }
    
    // Check for buffer misses
    const bufferHitRatio = plan.Plan['Shared Hit Blocks'] / 
                          (plan.Plan['Shared Hit Blocks'] + plan.Plan['Shared Read Blocks']);
    
    if (bufferHitRatio < 0.9) {
      recommendations.push('Low buffer hit ratio. Consider increasing shared_buffers');
    }
    
    return recommendations;
  }

  /**
   * Create optimized indexes
   */
  static async createOptimizedIndex(
    table: string,
    columns: string[],
    options: IndexOptions = {}
  ): Promise<void> {
    const {
      name,
      unique = false,
      partial,
      method = 'btree',
      concurrent = true
    } = options;

    const indexName = name || `idx_${table}_${columns.join('_')}`;
    const uniqueClause = unique ? 'UNIQUE' : '';
    const concurrentClause = concurrent ? 'CONCURRENTLY' : '';
    const partialClause = partial ? `WHERE ${partial}` : '';
    
    const query = `
      CREATE ${uniqueClause} INDEX ${concurrentClause} ${indexName}
      ON ${table} USING ${method} (${columns.join(', ')})
      ${partialClause}
    `;

    await this.query(query, [], { name: 'create_index' });
  }

  /**
   * Utility functions
   */
  private static chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private static generateQueryName(query: string): string {
    const operation = query.trim().split(' ')[0].toLowerCase();
    const hash = this.simpleHash(query);
    return `${operation}_${hash}`;
  }

  private static generateCacheKey(query: string, params?: any[]): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `query:${this.simpleHash(query + paramStr)}`;
  }

  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Close database pool
   */
  static async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

// Type definitions
export interface QueryOptions {
  cache?: boolean;
  cacheTTL?: number;
  cacheKey?: string;
  timeout?: number;
  retries?: number;
  name?: string;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
  fields: any[];
}

export interface TransactionOptions {
  isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  timeout?: number;
}

export interface BatchInsertOptions {
  batchSize?: number;
  onConflict?: string;
}

export interface BulkUpdateOptions {
  batchSize?: number;
}

export interface PaginatedQueryOptions {
  countQuery?: string;
  cache?: boolean;
  cacheTTL?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface FullTextSearchOptions {
  additionalWhere?: string;
  orderBy?: string;
  limit?: number;
  language?: string;
}

export interface QueryAnalysis {
  executionTime: number;
  planningTime: number;
  totalCost: number;
  actualRows: number;
  estimatedRows: number;
  bufferHits: number;
  bufferReads: number;
  recommendations: string[];
}

export interface IndexOptions {
  name?: string;
  unique?: boolean;
  partial?: string;
  method?: 'btree' | 'hash' | 'gist' | 'gin';
  concurrent?: boolean;
}