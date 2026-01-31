import { Request, Response, NextFunction } from 'express';
import { ApiKeyRequest } from './apiKey';
import { VersionedRequest } from './versioning';

export interface MonitoringRequest extends ApiKeyRequest, VersionedRequest {
  monitoring?: {
    startTime: number;
    requestId: string;
  };
}

/**
 * API monitoring and analytics middleware
 */
export class ApiMonitoring {
  private static metrics: Map<string, any> = new Map();
  private static redis: any;

  static initialize(redisClient: any) {
    this.redis = redisClient;
  }

  /**
   * Generate unique request ID
   */
  static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Request tracking middleware
   */
  static requestTracking() {
    return (req: MonitoringRequest, res: Response, next: NextFunction): void => {
      const requestId = this.generateRequestId();
      const startTime = Date.now();

      req.monitoring = {
        startTime,
        requestId
      };

      // Add request ID to response headers
      res.setHeader('X-Request-ID', requestId);

      // Log request start
      console.log(`[${requestId}] ${req.method} ${req.path} - Started`);

      next();
    };
  }

  /**
   * Response time monitoring
   */
  static responseTimeMonitoring() {
    return (req: MonitoringRequest, res: Response, next: NextFunction): void => {
      const originalEnd = res.end;

      res.end = function (chunk?: any, encoding?: any): any {
        if (req.monitoring) {
          const responseTime = Date.now() - req.monitoring.startTime;
          const endpoint = `${req.method} ${req.route?.path || req.path}`;

          // Only set header if headers haven't been sent yet
          if (!res.headersSent) {
            res.setHeader('X-Response-Time', `${responseTime}ms`);
          }

          // Log response
          console.log(`[${req.monitoring.requestId}] ${endpoint} - ${res.statusCode} (${responseTime}ms)`);

          // Record metrics
          ApiMonitoring.recordMetric('response_time', responseTime, {
            endpoint,
            method: req.method,
            statusCode: res.statusCode,
            apiVersion: req.apiVersion,
            apiKeyId: req.apiKey?.id
          });

          // Record endpoint usage
          ApiMonitoring.recordEndpointUsage(endpoint, req.method, res.statusCode, responseTime);
        }

        return originalEnd.call(res, chunk, encoding);
      } as any;

      next();
    };
  }

  /**
   * Error rate monitoring
   */
  static errorRateMonitoring() {
    return (req: MonitoringRequest, res: Response, next: NextFunction): void => {
      const originalEnd = res.end;

      res.end = function (chunk?: any, encoding?: any): any {
        const endpoint = `${req.method} ${req.route?.path || req.path}`;
        const isError = res.statusCode >= 400;

        if (isError) {
          ApiMonitoring.recordMetric('error_count', 1, {
            endpoint,
            method: req.method,
            statusCode: res.statusCode,
            errorType: ApiMonitoring.getErrorType(res.statusCode)
          });
        }

        ApiMonitoring.recordMetric('request_count', 1, {
          endpoint,
          method: req.method,
          statusCode: res.statusCode,
          success: !isError
        });

        return originalEnd.call(res, chunk, encoding);
      } as any;

      next();
    };
  }

  /**
   * API version usage tracking
   */
  static versionUsageTracking() {
    return (req: MonitoringRequest, res: Response, next: NextFunction): void => {
      if (req.apiVersion) {
        this.recordMetric('api_version_usage', 1, {
          version: req.apiVersion,
          endpoint: `${req.method} ${req.route?.path || req.path}`
        });
      }
      next();
    };
  }

  /**
   * Record a metric
   */
  static recordMetric(name: string, value: number, tags: Record<string, any> = {}): void {
    const timestamp = Date.now();
    const metricKey = `metric:${name}:${timestamp}`;

    const metric = {
      name,
      value,
      tags,
      timestamp
    };

    // Store in memory (for immediate access)
    this.metrics.set(metricKey, metric);

    // Store in Redis (for persistence and aggregation)
    if (this.redis) {
      this.redis.setex(metricKey, 3600, JSON.stringify(metric)); // 1 hour TTL

      // Also update aggregated metrics
      this.updateAggregatedMetrics(name, value, tags);
    }
  }

  /**
   * Update aggregated metrics in Redis
   */
  static async updateAggregatedMetrics(name: string, value: number, tags: Record<string, any>): Promise<void> {
    if (!this.redis) return;

    const now = new Date();
    const hourKey = `agg:${name}:hour:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
    const dayKey = `agg:${name}:day:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

    try {
      // Update hourly aggregates
      await this.redis.hincrby(hourKey, 'count', 1);
      await this.redis.hincrby(hourKey, 'sum', value);
      await this.redis.expire(hourKey, 86400); // 24 hours TTL

      // Update daily aggregates
      await this.redis.hincrby(dayKey, 'count', 1);
      await this.redis.hincrby(dayKey, 'sum', value);
      await this.redis.expire(dayKey, 604800); // 7 days TTL

      // Update tag-specific aggregates
      for (const [tagKey, tagValue] of Object.entries(tags)) {
        const taggedKey = `agg:${name}:${tagKey}:${tagValue}:hour:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
        await this.redis.hincrby(taggedKey, 'count', 1);
        await this.redis.hincrby(taggedKey, 'sum', value);
        await this.redis.expire(taggedKey, 86400);
      }
    } catch (error) {
      console.error('Failed to update aggregated metrics:', error);
    }
  }

  /**
   * Record endpoint usage
   */
  static recordEndpointUsage(endpoint: string, method: string, statusCode: number, responseTime: number): void {
    const usageKey = `endpoint_usage:${endpoint}:${method}`;

    if (this.redis) {
      const usage = {
        endpoint,
        method,
        statusCode,
        responseTime,
        timestamp: Date.now()
      };

      this.redis.lpush(usageKey, JSON.stringify(usage));
      this.redis.ltrim(usageKey, 0, 999); // Keep last 1000 requests
      this.redis.expire(usageKey, 86400); // 24 hours TTL
    }
  }

  /**
   * Get error type from status code
   */
  static getErrorType(statusCode: number): string {
    if (statusCode >= 400 && statusCode < 500) {
      return 'client_error';
    } else if (statusCode >= 500) {
      return 'server_error';
    }
    return 'unknown';
  }

  /**
   * Get metrics summary
   */
  static async getMetricsSummary(timeRange: { start: Date; end: Date }): Promise<{
    totalRequests: number;
    averageResponseTime: number;
    errorRate: number;
    topEndpoints: Array<{ endpoint: string; count: number; avgResponseTime: number }>;
    statusCodeDistribution: Record<string, number>;
    apiVersionUsage: Record<string, number>;
  }> {
    const summary = {
      totalRequests: 0,
      averageResponseTime: 0,
      errorRate: 0,
      topEndpoints: [] as Array<{ endpoint: string; count: number; avgResponseTime: number }>,
      statusCodeDistribution: {} as Record<string, number>,
      apiVersionUsage: {} as Record<string, number>
    };

    if (!this.redis) {
      return summary;
    }

    try {
      // Get aggregated data from Redis
      const keys = await this.redis.keys('agg:*');

      for (const key of keys) {
        const data = await this.redis.hgetall(key);
        if (data.count) {
          summary.totalRequests += parseInt(data.count);
          summary.averageResponseTime += parseInt(data.sum || 0);
        }
      }

      if (summary.totalRequests > 0) {
        summary.averageResponseTime = summary.averageResponseTime / summary.totalRequests;
      }

      // Calculate error rate
      const errorKeys = await this.redis.keys('agg:error_count:*');
      let totalErrors = 0;

      for (const key of errorKeys) {
        const data = await this.redis.hgetall(key);
        if (data.count) {
          totalErrors += parseInt(data.count);
        }
      }

      summary.errorRate = summary.totalRequests > 0 ? (totalErrors / summary.totalRequests) * 100 : 0;

    } catch (error) {
      console.error('Failed to get metrics summary:', error);
    }

    return summary;
  }

  /**
   * Health check for monitoring system
   */
  static async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: {
      memoryUsage: number;
      redisConnected: boolean;
      metricsCount: number;
    };
  }> {
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB
    const redisConnected = this.redis ? await this.redis.ping() === 'PONG' : false;
    const metricsCount = this.metrics.size;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (!redisConnected) {
      status = 'degraded';
    }

    if (memoryUsage > 500) { // More than 500MB
      status = 'unhealthy';
    }

    return {
      status,
      metrics: {
        memoryUsage,
        redisConnected,
        metricsCount
      }
    };
  }

  /**
   * Cleanup old metrics
   */
  static cleanupMetrics(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

    for (const [key, metric] of this.metrics.entries()) {
      if (metric.timestamp < cutoff) {
        this.metrics.delete(key);
      }
    }
  }

  /**
   * Start periodic cleanup
   */
  static startPeriodicCleanup(): void {
    setInterval(() => {
      this.cleanupMetrics();
    }, 60 * 60 * 1000); // Every hour
  }
}