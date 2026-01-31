import { Pool, PoolClient } from 'pg';
import { Redis } from 'ioredis';

// Database connection configuration
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
}

// Redis configuration
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export class DatabaseManager {
  private pool: Pool;
  private redis: Redis;

  constructor(dbConfig: DatabaseConfig, redisConfig: RedisConfig) {
    // PostgreSQL connection pool
    this.pool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.username,
      password: dbConfig.password,
      ssl: dbConfig.ssl,
      max: dbConfig.maxConnections || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Redis connection
    this.redis = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db || 0,
      maxRetriesPerRequest: 3,
    });

    // Handle connection events
    this.pool.on('error', (err: Error) => {
      console.error('PostgreSQL pool error:', err);
    });

    this.redis.on('error', (err: Error) => {
      console.error('Redis connection error:', err);
    });
  }

  /**
   * Get a database client from the pool
   */
  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /**
   * Execute a query with automatic client management
   */
  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.getClient();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
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
   * Get Redis client
   */
  getRedis(): Redis {
    return this.redis;
  }

  /**
   * Cache data with expiration
   */
  async cache(key: string, data: any, expirationSeconds: number = 3600): Promise<void> {
    await this.redis.setex(key, expirationSeconds, JSON.stringify(data));
  }

  /**
   * Get cached data
   */
  async getCached<T>(key: string): Promise<T | null> {
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Delete cached data
   */
  async deleteCached(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.pool.end();
    await this.redis.quit();
  }
}

// Utility functions for common database operations
export class QueryBuilder {
  /**
   * Build a SELECT query with pagination
   */
  static buildPaginatedQuery(
    baseQuery: string,
    page: number = 1,
    limit: number = 20,
    orderBy?: string
  ): { query: string; offset: number } {
    const offset = (page - 1) * limit;
    let query = baseQuery;
    
    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }
    
    query += ` LIMIT $${baseQuery.split('$').length} OFFSET $${baseQuery.split('$').length + 1}`;
    
    return { query, offset };
  }

  /**
   * Build an INSERT query with RETURNING clause
   */
  static buildInsertQuery(table: string, data: Record<string, any>): { query: string; values: any[] } {
    const columns = Object.keys(data);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const values = Object.values(data);

    const query = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    return { query, values };
  }

  /**
   * Build an UPDATE query with WHERE clause
   */
  static buildUpdateQuery(
    table: string,
    data: Record<string, any>,
    whereClause: string,
    whereValues: any[]
  ): { query: string; values: any[] } {
    const columns = Object.keys(data);
    const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(', ');
    const values = [...Object.values(data), ...whereValues];

    const query = `
      UPDATE ${table}
      SET ${setClause}, updated_at = NOW()
      WHERE ${whereClause}
      RETURNING *
    `;

    return { query, values };
  }
}

// Database migration utilities
export class MigrationRunner {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * Create migrations table if it doesn't exist
   */
  async createMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await this.db.query(query);
  }

  /**
   * Check if a migration has been executed
   */
  async isMigrationExecuted(name: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM migrations WHERE name = $1',
      [name]
    );
    return result.rows.length > 0;
  }

  /**
   * Mark a migration as executed
   */
  async markMigrationExecuted(name: string): Promise<void> {
    await this.db.query(
      'INSERT INTO migrations (name) VALUES ($1)',
      [name]
    );
  }
}