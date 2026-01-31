import { Request, Response, NextFunction } from 'express';
import { PerformanceUtils, ApiPerformance } from '../utils/performance';
import { CacheUtils } from '../utils/cache';

/**
 * Performance monitoring middleware for Express applications
 */
export class PerformanceMiddleware {
  /**
   * Request timing middleware
   */
  static requestTiming() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const startTime = process.hrtime.bigint();
      
      // Add timing info to request
      (req as any).startTime = startTime;
      
      // Override res.end to capture response time
      const originalEnd = res.end;
      (res as any).end = function (...args: any[]) {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        
        // Record metrics
        const endpoint = `${req.method}_${req.route?.path || req.path}`;
        PerformanceUtils.recordMetric(`api_response_time_${endpoint}`, duration);
        PerformanceUtils.recordMetric(`api_requests_${endpoint}`, 1, 'count');
        
        // Record status code metrics
        PerformanceUtils.recordMetric(`api_status_${res.statusCode}`, 1, 'count');
        
        // Record error metrics
        if (res.statusCode >= 400) {
          PerformanceUtils.recordMetric(`api_errors_${endpoint}`, 1, 'count');
        }
        
        // Add performance headers
        res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);
        res.setHeader('X-Request-ID', req.headers['x-request-id'] || 'unknown');
        
        // Log slow requests
        if (duration > 1000) {
          console.warn(`Slow request: ${endpoint} took ${duration.toFixed(2)}ms`, {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            userAgent: req.get('User-Agent'),
            ip: req.ip
          });
        }
        
        return (originalEnd as any).apply(res, args);
      };
      
      next();
    };
  }

  /**
   * Memory usage monitoring middleware
   */
  static memoryMonitoring() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const memBefore = process.memoryUsage();
      
      // Override res.end to capture memory usage
      const originalEnd = res.end;
      (res as any).end = function (...args: any[]) {
        const memAfter = process.memoryUsage();
        const memDiff = memAfter.heapUsed - memBefore.heapUsed;
        
        // Record memory metrics
        PerformanceUtils.recordMetric('memory_heap_used', memAfter.heapUsed, 'bytes');
        PerformanceUtils.recordMetric('memory_heap_total', memAfter.heapTotal, 'bytes');
        PerformanceUtils.recordMetric('memory_request_diff', memDiff, 'bytes');
        
        // Warn about memory leaks
        if (memDiff > 10 * 1024 * 1024) { // 10MB
          console.warn(`High memory usage detected: ${memDiff / 1024 / 1024}MB increase`, {
            endpoint: `${req.method} ${req.path}`,
            before: memBefore.heapUsed,
            after: memAfter.heapUsed
          });
        }
        
        return (originalEnd as any).apply(res, args);
      };
      
      next();
    };
  }

  /**
   * Cache performance monitoring
   */
  static cacheMonitoring() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Monitor cache operations during request
      const originalGet = CacheUtils.get;
      const originalSet = CacheUtils.set;
      
      let cacheHits = 0;
      let cacheMisses = 0;
      let cacheWrites = 0;
      
      // Wrap cache get method
      CacheUtils.get = async function<T>(key: string): Promise<T | null> {
        const result = await originalGet.call(this, key) as T | null;
        if (result !== null) {
          cacheHits++;
        } else {
          cacheMisses++;
        }
        return result;
      };
      
      // Wrap cache set method
      CacheUtils.set = async function(key: string, value: any, ttl?: number): Promise<void> {
        cacheWrites++;
        return await originalSet.call(this, key, value, ttl);
      };
      
      // Override res.end to record cache metrics
      const originalEnd = res.end;
      (res as any).end = function (...args: any[]) {
        // Record cache metrics for this request
        if (cacheHits > 0) {
          PerformanceUtils.recordMetric('cache_hits', cacheHits, 'count');
        }
        if (cacheMisses > 0) {
          PerformanceUtils.recordMetric('cache_misses', cacheMisses, 'count');
        }
        if (cacheWrites > 0) {
          PerformanceUtils.recordMetric('cache_writes', cacheWrites, 'count');
        }
        
        // Calculate hit rate
        const totalCacheOps = cacheHits + cacheMisses;
        if (totalCacheOps > 0) {
          const hitRate = (cacheHits / totalCacheOps) * 100;
          PerformanceUtils.recordMetric('cache_hit_rate', hitRate, 'percent');
        }
        
        // Restore original methods
        CacheUtils.get = originalGet;
        CacheUtils.set = originalSet;
        
        return (originalEnd as any).apply(res, args);
      };
      
      next();
    };
  }

  /**
   * Database query monitoring middleware
   */
  static databaseMonitoring() {
    return (req: Request, res: Response, next: NextFunction): void => {
      let queryCount = 0;
      let totalQueryTime = 0;
      
      // Track database queries during request
      (req as any).dbQueries = [];
      
      // Override res.end to record database metrics
      const originalEnd = res.end;
      (res as any).end = function (...args: any[]) {
        const queries = (req as any).dbQueries || [];
        
        if (queries.length > 0) {
          queryCount = queries.length;
          totalQueryTime = queries.reduce((sum: number, query: any) => sum + query.duration, 0);
          
          PerformanceUtils.recordMetric('db_queries_per_request', queryCount, 'count');
          PerformanceUtils.recordMetric('db_total_query_time', totalQueryTime, 'ms');
          PerformanceUtils.recordMetric('db_avg_query_time', totalQueryTime / queryCount, 'ms');
          
          // Warn about N+1 queries
          if (queryCount > 10) {
            console.warn(`Potential N+1 query problem: ${queryCount} queries in single request`, {
              endpoint: `${req.method} ${req.path}`,
              queryCount,
              totalTime: totalQueryTime
            });
          }
        }
        
        return (originalEnd as any).apply(res, args);
      };
      
      next();
    };
  }

  /**
   * Rate limiting monitoring
   */
  static rateLimitMonitoring() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const rateLimitInfo = {
        limit: res.getHeader('X-RateLimit-Limit'),
        remaining: res.getHeader('X-RateLimit-Remaining'),
        reset: res.getHeader('X-RateLimit-Reset')
      };
      
      if (rateLimitInfo.limit && rateLimitInfo.remaining) {
        const endpoint = `${req.method}_${req.route?.path || req.path}`;
        ApiPerformance.recordRateLimitMetrics(
          endpoint,
          Number(rateLimitInfo.remaining),
          Number(rateLimitInfo.limit)
        );
        
        // Warn when approaching rate limit
        const usagePercent = (1 - Number(rateLimitInfo.remaining) / Number(rateLimitInfo.limit)) * 100;
        if (usagePercent > 80) {
          console.warn(`High rate limit usage: ${usagePercent.toFixed(1)}% for ${endpoint}`);
        }
      }
      
      next();
    };
  }

  /**
   * Error tracking middleware
   */
  static errorTracking() {
    return (err: Error, req: Request, res: Response, next: NextFunction): void => {
      const endpoint = `${req.method}_${req.route?.path || req.path}`;
      
      // Record error metrics
      PerformanceUtils.recordMetric(`errors_${endpoint}`, 1, 'count');
      PerformanceUtils.recordMetric(`errors_${err.name}`, 1, 'count');
      
      // Record error by status code
      const statusCode = res.statusCode || 500;
      PerformanceUtils.recordMetric(`errors_status_${statusCode}`, 1, 'count');
      
      // Log error details
      console.error('Request error:', {
        error: err.message,
        stack: err.stack,
        endpoint,
        method: req.method,
        path: req.path,
        statusCode,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
      
      next(err);
    };
  }

  /**
   * Request size monitoring
   */
  static requestSizeMonitoring() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const contentLength = req.get('Content-Length');
      
      if (contentLength) {
        const size = parseInt(contentLength);
        const endpoint = `${req.method}_${req.route?.path || req.path}`;
        
        PerformanceUtils.recordMetric(`request_size_${endpoint}`, size, 'bytes');
        PerformanceUtils.recordMetric('request_size_total', size, 'bytes');
        
        // Warn about large requests
        if (size > 1024 * 1024) { // 1MB
          console.warn(`Large request detected: ${size / 1024 / 1024}MB`, {
            endpoint,
            size,
            contentType: req.get('Content-Type')
          });
        }
      }
      
      next();
    };
  }

  /**
   * Response size monitoring
   */
  static responseSizeMonitoring() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const originalSend = res.send;
      const originalJson = res.json;
      
      // Override res.send
      res.send = function (body: any) {
        const size = Buffer.byteLength(body || '', 'utf8');
        recordResponseSize(req, size);
        return originalSend.call(this, body);
      };
      
      // Override res.json
      res.json = function (obj: any) {
        const body = JSON.stringify(obj);
        const size = Buffer.byteLength(body, 'utf8');
        recordResponseSize(req, size);
        return originalJson.call(this, obj);
      };
      
      function recordResponseSize(req: Request, size: number) {
        const endpoint = `${req.method}_${req.route?.path || req.path}`;
        
        PerformanceUtils.recordMetric(`response_size_${endpoint}`, size, 'bytes');
        PerformanceUtils.recordMetric('response_size_total', size, 'bytes');
        
        // Warn about large responses
        if (size > 1024 * 1024) { // 1MB
          console.warn(`Large response detected: ${size / 1024 / 1024}MB`, {
            endpoint,
            size,
            statusCode: res.statusCode
          });
        }
      }
      
      next();
    };
  }

  /**
   * Comprehensive performance monitoring (combines all monitors)
   */
  static comprehensive() {
    return [
      this.requestTiming(),
      this.memoryMonitoring(),
      this.cacheMonitoring(),
      this.databaseMonitoring(),
      this.rateLimitMonitoring(),
      this.requestSizeMonitoring(),
      this.responseSizeMonitoring()
    ];
  }

  /**
   * Performance report endpoint middleware
   */
  static performanceReport() {
    return async (req: Request, res: Response): Promise<void> => {
      try {
        const report = PerformanceUtils.createReport();
        const cacheStats = await CacheUtils.getStats();
        
        res.json({
          success: true,
          data: {
            ...report,
            cache: cacheStats
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error generating performance report:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'PERFORMANCE_REPORT_ERROR',
            message: 'Failed to generate performance report'
          },
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  /**
   * Health check endpoint with performance metrics
   */
  static healthCheck() {
    return async (req: Request, res: Response): Promise<void> => {
      try {
        const systemInfo = PerformanceUtils.getSystemInfo();
        const cacheStats = await CacheUtils.getStats();
        
        // Determine health status
        const memoryUsagePercent = (systemInfo.memory.heapUsed / systemInfo.memory.heapTotal) * 100;
        const isHealthy = memoryUsagePercent < 90 && cacheStats.connected;
        
        res.status(isHealthy ? 200 : 503).json({
          status: isHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime: systemInfo.uptime,
          memory: {
            usage: memoryUsagePercent,
            heapUsed: systemInfo.memory.heapUsed,
            heapTotal: systemInfo.memory.heapTotal
          },
          cache: {
            connected: cacheStats.connected
          },
          version: process.env.npm_package_version || '1.0.0'
        });
      } catch (error) {
        console.error('Health check error:', error);
        res.status(503).json({
          status: 'unhealthy',
          error: 'Health check failed',
          timestamp: new Date().toISOString()
        });
      }
    };
  }
}

/**
 * Performance optimization recommendations
 */
export class PerformanceOptimizer {
  /**
   * Analyze request patterns and suggest optimizations
   */
  static analyzeAndOptimize(): void {
    const metrics = PerformanceUtils.getAllMetrics();
    
    // Analyze slow endpoints
    const slowEndpoints = metrics
      .filter(m => m.name.startsWith('api_response_time_') && m.average > 1000)
      .sort((a, b) => b.average - a.average);
    
    if (slowEndpoints.length > 0) {
      console.log('Performance Optimization Recommendations:');
      slowEndpoints.forEach(endpoint => {
        console.log(`- ${endpoint.name}: ${endpoint.average.toFixed(2)}ms average response time`);
        console.log('  Suggestions: Add caching, optimize database queries, or implement pagination');
      });
    }
    
    // Analyze cache performance
    const cacheHits = metrics.find(m => m.name === 'cache_hits')?.total || 0;
    const cacheMisses = metrics.find(m => m.name === 'cache_misses')?.total || 0;
    const totalCacheOps = cacheHits + cacheMisses;
    
    if (totalCacheOps > 0) {
      const hitRate = (cacheHits / totalCacheOps) * 100;
      if (hitRate < 70) {
        console.log(`Cache hit rate is low (${hitRate.toFixed(1)}%). Consider:
          - Increasing cache TTL for stable data
          - Implementing cache warming strategies
          - Reviewing cache key strategies`);
      }
    }
    
    // Analyze memory usage
    const memoryMetrics = metrics.filter(m => m.name.startsWith('memory_'));
    const highMemoryRequests = memoryMetrics.filter(m => m.name === 'memory_request_diff' && m.average > 5 * 1024 * 1024);
    
    if (highMemoryRequests.length > 0) {
      console.log(`High memory usage detected. Consider:
        - Implementing streaming for large data sets
        - Optimizing object creation and disposal
        - Using pagination for large responses`);
    }
  }
}