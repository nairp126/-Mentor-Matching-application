import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Pool } from 'pg';

export interface ApiKeyRequest extends Request {
  apiKey?: {
    id: string;
    name: string;
    userId: string;
    permissions: string[];
    rateLimit: {
      requests: number;
      window: number; // in seconds
    };
  };
}

export interface ApiKeyData {
  id: string;
  name: string;
  userId: string;
  keyHash: string;
  permissions: string[];
  rateLimit: {
    requests: number;
    window: number;
  };
  active: boolean;
  lastUsed?: Date;
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * API Key authentication and management
 */
export class ApiKeyAuth {
  private static db: Pool;
  private static redis: any; // Redis client for rate limiting

  static initialize(database: Pool, redisClient: any) {
    this.db = database;
    this.redis = redisClient;
  }

  /**
   * Generate a new API key
   */
  static generateApiKey(): { key: string; hash: string } {
    const key = `mk_${crypto.randomBytes(32).toString('hex')}`;
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    return { key, hash };
  }

  /**
   * Create a new API key
   */
  static async createApiKey(data: {
    name: string;
    userId: string;
    permissions: string[];
    rateLimit?: { requests: number; window: number };
    expiresAt?: Date;
  }): Promise<{ apiKey: string; keyData: ApiKeyData }> {
    const { key, hash } = this.generateApiKey();
    const id = crypto.randomUUID();

    const defaultRateLimit = { requests: 1000, window: 3600 }; // 1000 requests per hour

    const keyData: ApiKeyData = {
      id,
      name: data.name,
      userId: data.userId,
      keyHash: hash,
      permissions: data.permissions,
      rateLimit: data.rateLimit || defaultRateLimit,
      active: true,
      createdAt: new Date(),
      expiresAt: data.expiresAt,
    };

    await this.db.query(`
      INSERT INTO api_keys (
        id, name, user_id, key_hash, permissions, rate_limit_requests, 
        rate_limit_window, active, created_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      keyData.id,
      keyData.name,
      keyData.userId,
      keyData.keyHash,
      JSON.stringify(keyData.permissions),
      keyData.rateLimit.requests,
      keyData.rateLimit.window,
      keyData.active,
      keyData.createdAt,
      keyData.expiresAt,
    ]);

    return { apiKey: key, keyData };
  }

  /**
   * Validate API key
   */
  static async validateApiKey(key: string): Promise<ApiKeyData | null> {
    if (!key || !key.startsWith('mk_')) {
      return null;
    }

    const hash = crypto.createHash('sha256').update(key).digest('hex');

    const result = await this.db.query(`
      SELECT 
        id, name, user_id, permissions, rate_limit_requests, 
        rate_limit_window, active, last_used, created_at, expires_at
      FROM api_keys 
      WHERE key_hash = $1 AND active = true
    `, [hash]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Check if key is expired
    if (row.expires_at && new Date() > new Date(row.expires_at)) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      userId: row.user_id,
      keyHash: hash,
      permissions: JSON.parse(row.permissions),
      rateLimit: {
        requests: row.rate_limit_requests,
        window: row.rate_limit_window,
      },
      active: row.active,
      lastUsed: row.last_used,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  /**
   * Check rate limit for API key
   */
  static async checkRateLimit(keyId: string, rateLimit: { requests: number; window: number }): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const key = `api_rate_limit:${keyId}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % rateLimit.window);

    try {
      // Use Redis sliding window for rate limiting
      const pipeline = this.redis.pipeline();
      pipeline.zremrangebyscore(key, 0, now - rateLimit.window);
      pipeline.zcard(key);
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      pipeline.expire(key, rateLimit.window);

      const results = await pipeline.exec();
      const currentCount = results[1][1];

      const allowed = currentCount < rateLimit.requests;
      const remaining = Math.max(0, rateLimit.requests - currentCount - 1);
      const resetTime = windowStart + rateLimit.window;

      return { allowed, remaining, resetTime };
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // Fail open - allow request if Redis is down
      return { allowed: true, remaining: rateLimit.requests - 1, resetTime: now + rateLimit.window };
    }
  }

  /**
   * Update API key last used timestamp
   */
  static async updateLastUsed(keyId: string): Promise<void> {
    try {
      await this.db.query(
        'UPDATE api_keys SET last_used = NOW() WHERE id = $1',
        [keyId]
      );
    } catch (error) {
      console.error('Failed to update API key last used:', error);
    }
  }

  /**
   * Check if API key has permission
   */
  static hasPermission(apiKey: ApiKeyData, permission: string): boolean {
    return apiKey.permissions.includes('*') || apiKey.permissions.includes(permission);
  }

  /**
   * API key authentication middleware
   */
  static middleware(requiredPermissions: string[] = []) {
    return async (req: ApiKeyRequest, res: Response, next: NextFunction): Promise<any> => {
      const apiKey = req.headers['x-api-key'] as string;

      if (!apiKey) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'API_KEY_REQUIRED',
            message: 'API key is required for this endpoint'
          },
          timestamp: new Date().toISOString()
        });
      }

      try {
        const keyData = await this.validateApiKey(apiKey);

        if (!keyData) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'INVALID_API_KEY',
              message: 'Invalid or expired API key'
            },
            timestamp: new Date().toISOString()
          });
        }

        // Check permissions
        for (const permission of requiredPermissions) {
          if (!this.hasPermission(keyData, permission)) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'INSUFFICIENT_PERMISSIONS',
                message: `API key does not have required permission: ${permission}`,
                requiredPermissions,
                availablePermissions: keyData.permissions
              },
              timestamp: new Date().toISOString()
            });
          }
        }

        // Check rate limit
        const rateLimitResult = await this.checkRateLimit(keyData.id, keyData.rateLimit);

        if (!rateLimitResult.allowed) {
          res.setHeader('X-RateLimit-Limit', keyData.rateLimit.requests);
          res.setHeader('X-RateLimit-Remaining', 0);
          res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime);

          return res.status(429).json({
            success: false,
            error: {
              code: 'API_RATE_LIMIT_EXCEEDED',
              message: 'API key rate limit exceeded',
              rateLimit: {
                requests: keyData.rateLimit.requests,
                window: keyData.rateLimit.window,
                resetTime: rateLimitResult.resetTime
              }
            },
            timestamp: new Date().toISOString()
          });
        }

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', keyData.rateLimit.requests);
        res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
        res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime);

        // Add API key info to request
        req.apiKey = keyData;

        // Update last used timestamp (async, don't wait)
        this.updateLastUsed(keyData.id).catch(console.error);

        next();
      } catch (error) {
        console.error('API key authentication error:', error);
        return res.status(500).json({
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Internal authentication error'
          },
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  /**
   * Get API key usage statistics
   */
  static async getUsageStats(keyId: string, timeRange: { start: Date; end: Date }): Promise<{
    totalRequests: number;
    requestsByDay: Array<{ date: string; count: number }>;
    topEndpoints: Array<{ endpoint: string; count: number }>;
    errorRate: number;
  }> {
    const result = await this.db.query(`
      SELECT 
        COUNT(*) as total_requests,
        DATE(created_at) as request_date,
        endpoint,
        status_code,
        COUNT(*) as count
      FROM api_key_usage 
      WHERE api_key_id = $1 
        AND created_at >= $2 
        AND created_at <= $3
      GROUP BY DATE(created_at), endpoint, status_code
      ORDER BY request_date DESC, count DESC
    `, [keyId, timeRange.start, timeRange.end]);

    const totalRequests = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    const errorRequests = result.rows
      .filter(row => row.status_code >= 400)
      .reduce((sum, row) => sum + parseInt(row.count), 0);

    const requestsByDay = result.rows.reduce((acc, row) => {
      const existing = acc.find((item: any) => item.date === row.request_date);
      if (existing) {
        existing.count += parseInt(row.count);
      } else {
        acc.push({ date: row.request_date, count: parseInt(row.count) });
      }
      return acc;
    }, [] as Array<{ date: string; count: number }>);

    const topEndpoints = result.rows.reduce((acc, row) => {
      const existing = acc.find((item: any) => item.endpoint === row.endpoint);
      if (existing) {
        existing.count += parseInt(row.count);
      } else {
        acc.push({ endpoint: row.endpoint, count: parseInt(row.count) });
      }
      return acc;
    }, [] as Array<{ endpoint: string; count: number }>)
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, 10);

    return {
      totalRequests,
      requestsByDay,
      topEndpoints,
      errorRate: totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0
    };
  }

  /**
   * Log API key usage
   */
  static async logUsage(keyId: string, endpoint: string, method: string, statusCode: number, responseTime: number): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO api_key_usage (
          api_key_id, endpoint, method, status_code, response_time, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [keyId, endpoint, method, statusCode, responseTime]);
    } catch (error) {
      console.error('Failed to log API key usage:', error);
    }
  }

  /**
   * Usage logging middleware
   */
  static usageLoggingMiddleware() {
    return (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
      if (!req.apiKey) {
        return next();
      }

      const startTime = Date.now();

      // Override res.end to capture response
      const originalEnd = res.end;
      res.end = function(chunk?: any, encoding?: any): any {
        const responseTime = Date.now() - startTime;
        const endpoint = `${req.method} ${req.route?.path || req.path}`;

        // Log usage asynchronously
        ApiKeyAuth.logUsage(
          req.apiKey!.id,
          endpoint,
          req.method,
          res.statusCode,
          responseTime
        ).catch(console.error);

        originalEnd.call(res, chunk, encoding);
      } as any;

      next();
    };
  }
}