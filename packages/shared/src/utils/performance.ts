import { performance } from 'perf_hooks';

/**
 * Performance monitoring and optimization utilities
 */
export class PerformanceUtils {
  private static metrics: Map<string, PerformanceMetric> = new Map();
  private static timers: Map<string, number> = new Map();

  /**
   * Start timing an operation
   */
  static startTimer(name: string): void {
    this.timers.set(name, performance.now());
  }

  /**
   * End timing and record metric
   */
  static endTimer(name: string): number {
    const startTime = this.timers.get(name);
    if (!startTime) {
      console.warn(`Performance: Timer '${name}' was not started`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(name);
    this.recordMetric(name, duration);
    
    return duration;
  }

  /**
   * Record a performance metric
   */
  static recordMetric(name: string, value: number, unit: string = 'ms'): void {
    const existing = this.metrics.get(name);
    
    if (existing) {
      existing.count++;
      existing.total += value;
      existing.average = existing.total / existing.count;
      existing.min = Math.min(existing.min, value);
      existing.max = Math.max(existing.max, value);
      existing.lastValue = value;
      existing.lastUpdated = new Date();
    } else {
      this.metrics.set(name, {
        name,
        count: 1,
        total: value,
        average: value,
        min: value,
        max: value,
        lastValue: value,
        unit,
        lastUpdated: new Date()
      });
    }
  }

  /**
   * Get performance metric
   */
  static getMetric(name: string): PerformanceMetric | undefined {
    return this.metrics.get(name);
  }

  /**
   * Get all performance metrics
   */
  static getAllMetrics(): PerformanceMetric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Clear all metrics
   */
  static clearMetrics(): void {
    this.metrics.clear();
    this.timers.clear();
  }

  /**
   * Get system performance info
   */
  static getSystemInfo(): SystemPerformanceInfo {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };
  }

  /**
   * Monitor function execution time
   */
  static monitor<T>(name: string, fn: () => T): T;
  static monitor<T>(name: string, fn: () => Promise<T>): Promise<T>;
  static monitor<T>(name: string, fn: () => T | Promise<T>): T | Promise<T> {
    this.startTimer(name);
    
    try {
      const result = fn();
      
      if (result instanceof Promise) {
        return result
          .then(value => {
            this.endTimer(name);
            return value;
          })
          .catch(error => {
            this.endTimer(name);
            this.recordMetric(`${name}_error`, 1, 'count');
            throw error;
          });
      } else {
        this.endTimer(name);
        return result;
      }
    } catch (error) {
      this.endTimer(name);
      this.recordMetric(`${name}_error`, 1, 'count');
      throw error;
    }
  }

  /**
   * Create performance report
   */
  static createReport(): PerformanceReport {
    const metrics = this.getAllMetrics();
    const systemInfo = this.getSystemInfo();
    
    // Calculate percentiles for response times
    const responseTimes = metrics
      .filter(m => m.unit === 'ms' && m.name.includes('response'))
      .map(m => ({ name: m.name, times: [m.min, m.average, m.max] }));

    // Identify slow operations (> 1000ms average)
    const slowOperations = metrics
      .filter(m => m.unit === 'ms' && m.average > 1000)
      .sort((a, b) => b.average - a.average);

    // Calculate error rates
    const errorMetrics = metrics.filter(m => m.name.includes('_error'));
    const totalRequests = metrics
      .filter(m => !m.name.includes('_error'))
      .reduce((sum, m) => sum + m.count, 0);
    const totalErrors = errorMetrics.reduce((sum, m) => sum + m.count, 0);
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

    return {
      timestamp: new Date(),
      systemInfo,
      metrics,
      summary: {
        totalOperations: metrics.length,
        totalRequests,
        totalErrors,
        errorRate,
        averageResponseTime: this.calculateAverageResponseTime(metrics),
        slowOperations: slowOperations.length
      },
      responseTimes,
      slowOperations,
      recommendations: this.generateRecommendations(metrics, systemInfo)
    };
  }

  /**
   * Calculate average response time across all operations
   */
  private static calculateAverageResponseTime(metrics: PerformanceMetric[]): number {
    const responseMetrics = metrics.filter(m => m.unit === 'ms');
    if (responseMetrics.length === 0) return 0;
    
    const totalTime = responseMetrics.reduce((sum, m) => sum + m.total, 0);
    const totalCount = responseMetrics.reduce((sum, m) => sum + m.count, 0);
    
    return totalCount > 0 ? totalTime / totalCount : 0;
  }

  /**
   * Generate performance recommendations
   */
  private static generateRecommendations(
    metrics: PerformanceMetric[],
    systemInfo: SystemPerformanceInfo
  ): string[] {
    const recommendations: string[] = [];

    // Memory recommendations
    const memoryUsagePercent = (systemInfo.memory.heapUsed / systemInfo.memory.heapTotal) * 100;
    if (memoryUsagePercent > 80) {
      recommendations.push('High memory usage detected. Consider implementing memory optimization strategies.');
    }

    // Response time recommendations
    const slowOperations = metrics.filter(m => m.unit === 'ms' && m.average > 1000);
    if (slowOperations.length > 0) {
      recommendations.push(`${slowOperations.length} slow operations detected. Consider optimization or caching.`);
    }

    // Error rate recommendations
    const errorMetrics = metrics.filter(m => m.name.includes('_error'));
    const highErrorOperations = errorMetrics.filter(m => m.count > 10);
    if (highErrorOperations.length > 0) {
      recommendations.push('High error rates detected. Review error handling and system stability.');
    }

    // Database query recommendations
    const dbMetrics = metrics.filter(m => m.name.includes('db_') || m.name.includes('query_'));
    const slowDbOperations = dbMetrics.filter(m => m.average > 500);
    if (slowDbOperations.length > 0) {
      recommendations.push('Slow database operations detected. Consider query optimization or indexing.');
    }

    // Cache recommendations
    const cacheMetrics = metrics.filter(m => m.name.includes('cache_'));
    const cacheMisses = cacheMetrics.filter(m => m.name.includes('miss'));
    const cacheHits = cacheMetrics.filter(m => m.name.includes('hit'));
    
    if (cacheMisses.length > 0 && cacheHits.length > 0) {
      const missRate = cacheMisses.reduce((sum, m) => sum + m.count, 0) /
                      (cacheMisses.reduce((sum, m) => sum + m.count, 0) + 
                       cacheHits.reduce((sum, m) => sum + m.count, 0));
      
      if (missRate > 0.3) {
        recommendations.push('High cache miss rate detected. Review caching strategy and TTL settings.');
      }
    }

    return recommendations;
  }

  /**
   * Export metrics to external monitoring system
   */
  static async exportMetrics(endpoint?: string): Promise<void> {
    const report = this.createReport();
    
    if (endpoint) {
      try {
        // In a real implementation, this would send to monitoring service
        console.log('Performance: Exporting metrics to', endpoint);
        // await fetch(endpoint, { method: 'POST', body: JSON.stringify(report) });
      } catch (error) {
        console.error('Performance: Failed to export metrics:', error);
      }
    } else {
      // Log to console for development
      console.log('Performance Report:', JSON.stringify(report, null, 2));
    }
  }

  /**
   * Set up automatic metric collection
   */
  static setupAutoCollection(intervalMs: number = 60000): NodeJS.Timeout {
    return setInterval(() => {
      const systemInfo = this.getSystemInfo();
      
      // Record system metrics
      this.recordMetric('system_memory_heap_used', systemInfo.memory.heapUsed, 'bytes');
      this.recordMetric('system_memory_heap_total', systemInfo.memory.heapTotal, 'bytes');
      this.recordMetric('system_uptime', systemInfo.uptime, 'seconds');
      
      // Clean up old metrics (keep last 1000 entries per metric)
      this.cleanupOldMetrics();
    }, intervalMs);
  }

  /**
   * Clean up old metrics to prevent memory leaks
   */
  private static cleanupOldMetrics(): void {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const now = new Date();
    
    for (const [name, metric] of this.metrics.entries()) {
      if (now.getTime() - metric.lastUpdated.getTime() > maxAge) {
        this.metrics.delete(name);
      }
    }
  }
}

/**
 * Performance monitoring decorator
 */
export function Monitor(metricName?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const name = metricName || `${target.constructor.name}.${propertyName}`;

    descriptor.value = function (...args: any[]) {
      return PerformanceUtils.monitor(name, () => method.apply(this, args));
    };
  };
}

/**
 * Database query performance monitoring
 */
export class DatabasePerformance {
  /**
   * Monitor database query execution
   */
  static async monitorQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();
    
    try {
      const result = await queryFn();
      const duration = performance.now() - startTime;
      
      PerformanceUtils.recordMetric(`db_query_${queryName}`, duration);
      PerformanceUtils.recordMetric(`db_query_${queryName}_success`, 1, 'count');
      
      // Log slow queries
      if (duration > 1000) {
        console.warn(`Slow query detected: ${queryName} took ${duration.toFixed(2)}ms`);
      }
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      PerformanceUtils.recordMetric(`db_query_${queryName}`, duration);
      PerformanceUtils.recordMetric(`db_query_${queryName}_error`, 1, 'count');
      
      console.error(`Database query error: ${queryName}`, error);
      throw error;
    }
  }

  /**
   * Monitor connection pool performance
   */
  static recordConnectionMetrics(poolStats: any): void {
    PerformanceUtils.recordMetric('db_pool_total', poolStats.totalCount, 'count');
    PerformanceUtils.recordMetric('db_pool_idle', poolStats.idleCount, 'count');
    PerformanceUtils.recordMetric('db_pool_waiting', poolStats.waitingCount, 'count');
  }
}

/**
 * API performance monitoring
 */
export class ApiPerformance {
  /**
   * Monitor API endpoint performance
   */
  static monitorEndpoint(req: any, res: any, next: any): void {
    const startTime = performance.now();
    const endpoint = `${req.method}_${req.route?.path || req.path}`;
    
    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function (...args: any[]) {
      const duration = performance.now() - startTime;
      
      PerformanceUtils.recordMetric(`api_${endpoint}`, duration);
      PerformanceUtils.recordMetric(`api_${endpoint}_${res.statusCode}`, 1, 'count');
      
      if (res.statusCode >= 400) {
        PerformanceUtils.recordMetric(`api_${endpoint}_error`, 1, 'count');
      }
      
      // Log slow requests
      if (duration > 2000) {
        console.warn(`Slow API request: ${endpoint} took ${duration.toFixed(2)}ms`);
      }
      
      originalEnd.apply(this, args);
    };
    
    next();
  }

  /**
   * Record API rate limiting metrics
   */
  static recordRateLimitMetrics(endpoint: string, remaining: number, total: number): void {
    PerformanceUtils.recordMetric(`rate_limit_${endpoint}_remaining`, remaining, 'count');
    PerformanceUtils.recordMetric(`rate_limit_${endpoint}_usage`, total - remaining, 'count');
  }
}

// Type definitions
export interface PerformanceMetric {
  name: string;
  count: number;
  total: number;
  average: number;
  min: number;
  max: number;
  lastValue: number;
  unit: string;
  lastUpdated: Date;
}

export interface SystemPerformanceInfo {
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  uptime: number;
  nodeVersion: string;
  platform: string;
  arch: string;
}

export interface PerformanceReport {
  timestamp: Date;
  systemInfo: SystemPerformanceInfo;
  metrics: PerformanceMetric[];
  summary: {
    totalOperations: number;
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    averageResponseTime: number;
    slowOperations: number;
  };
  responseTimes: Array<{
    name: string;
    times: number[];
  }>;
  slowOperations: PerformanceMetric[];
  recommendations: string[];
}