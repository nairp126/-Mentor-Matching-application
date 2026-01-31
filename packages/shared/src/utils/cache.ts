import Redis from 'ioredis';

/**
 * Cache utility for Redis-based caching with performance optimizations
 */
export class CacheUtils {
  private static redis: Redis;
  private static defaultTTL = 3600; // 1 hour in seconds

  /**
   * Initialize Redis connection
   */
  static initialize(redisUrl?: string): void {
    const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
      family: 4
    });

    this.redis.on('connect', () => {
      console.log('Cache: Connected to Redis');
    });

    this.redis.on('error', (error) => {
      console.error('Cache: Redis connection error:', error);
    });

    this.redis.on('ready', () => {
      console.log('Cache: Redis is ready');
    });
  }

  /**
   * Get Redis instance
   */
  static getRedis(): Redis {
    if (!this.redis) {
      this.initialize();
    }
    return this.redis;
  }

  /**
   * Set cache value with TTL
   */
  static async set(key: string, value: any, ttl: number = this.defaultTTL): Promise<void> {
    try {
      const redis = this.getRedis();
      const serializedValue = JSON.stringify(value);
      await redis.setex(key, ttl, serializedValue);
    } catch (error) {
      console.error('Cache: Error setting value:', error);
      // Don't throw error to prevent cache failures from breaking the app
    }
  }

  /**
   * Get cache value
   */
  static async get<T = any>(key: string): Promise<T | null> {
    try {
      const redis = this.getRedis();
      const value = await redis.get(key);
      
      if (value === null) {
        return null;
      }
      
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('Cache: Error getting value:', error);
      return null;
    }
  }

  /**
   * Delete cache value
   */
  static async del(key: string): Promise<void> {
    try {
      const redis = this.getRedis();
      await redis.del(key);
    } catch (error) {
      console.error('Cache: Error deleting value:', error);
    }
  }

  /**
   * Delete multiple cache values
   */
  static async delMany(keys: string[]): Promise<void> {
    try {
      const redis = this.getRedis();
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error('Cache: Error deleting multiple values:', error);
    }
  }

  /**
   * Check if key exists
   */
  static async exists(key: string): Promise<boolean> {
    try {
      const redis = this.getRedis();
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Cache: Error checking existence:', error);
      return false;
    }
  }

  /**
   * Get TTL for a key
   */
  static async ttl(key: string): Promise<number> {
    try {
      const redis = this.getRedis();
      return await redis.ttl(key);
    } catch (error) {
      console.error('Cache: Error getting TTL:', error);
      return -1;
    }
  }

  /**
   * Extend TTL for a key
   */
  static async expire(key: string, ttl: number): Promise<void> {
    try {
      const redis = this.getRedis();
      await redis.expire(key, ttl);
    } catch (error) {
      console.error('Cache: Error setting expiration:', error);
    }
  }

  /**
   * Get or set pattern - fetch from cache or execute function and cache result
   */
  static async getOrSet<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // If not in cache, execute function
      const result = await fetchFunction();
      
      // Cache the result
      await this.set(key, result, ttl);
      
      return result;
    } catch (error) {
      console.error('Cache: Error in getOrSet:', error);
      // If cache fails, still execute the function
      return await fetchFunction();
    }
  }

  /**
   * Increment counter
   */
  static async increment(key: string, by: number = 1): Promise<number> {
    try {
      const redis = this.getRedis();
      return await redis.incrby(key, by);
    } catch (error) {
      console.error('Cache: Error incrementing:', error);
      return 0;
    }
  }

  /**
   * Set with NX (only if not exists)
   */
  static async setNX(key: string, value: any, ttl: number = this.defaultTTL): Promise<boolean> {
    try {
      const redis = this.getRedis();
      const serializedValue = JSON.stringify(value);
      const result = await redis.set(key, serializedValue, 'EX', ttl, 'NX');
      return result === 'OK';
    } catch (error) {
      console.error('Cache: Error setting NX:', error);
      return false;
    }
  }

  /**
   * Get multiple keys at once
   */
  static async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    try {
      const redis = this.getRedis();
      const values = await redis.mget(...keys);
      
      return values.map(value => {
        if (value === null) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      });
    } catch (error) {
      console.error('Cache: Error getting multiple values:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once
   */
  static async mset(keyValuePairs: Record<string, any>, ttl: number = this.defaultTTL): Promise<void> {
    try {
      const redis = this.getRedis();
      const pipeline = redis.pipeline();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const serializedValue = JSON.stringify(value);
        pipeline.setex(key, ttl, serializedValue);
      }
      
      await pipeline.exec();
    } catch (error) {
      console.error('Cache: Error setting multiple values:', error);
    }
  }

  /**
   * Clear all cache (use with caution)
   */
  static async clear(): Promise<void> {
    try {
      const redis = this.getRedis();
      await redis.flushdb();
    } catch (error) {
      console.error('Cache: Error clearing cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  static async getStats(): Promise<any> {
    try {
      const redis = this.getRedis();
      const info = await redis.info('memory');
      const keyspace = await redis.info('keyspace');
      
      return {
        memory: this.parseRedisInfo(info),
        keyspace: this.parseRedisInfo(keyspace),
        connected: redis.status === 'ready'
      };
    } catch (error) {
      console.error('Cache: Error getting stats:', error);
      return { connected: false };
    }
  }

  /**
   * Parse Redis INFO command output
   */
  private static parseRedisInfo(info: string): Record<string, any> {
    const result: Record<string, any> = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = isNaN(Number(value)) ? value : Number(value);
      }
    }
    
    return result;
  }

  /**
   * Create cache key with namespace
   */
  static createKey(namespace: string, ...parts: string[]): string {
    return `${namespace}:${parts.join(':')}`;
  }

  /**
   * Cache invalidation by pattern
   */
  static async invalidatePattern(pattern: string): Promise<void> {
    try {
      const redis = this.getRedis();
      const keys = await redis.keys(pattern);
      
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error('Cache: Error invalidating pattern:', error);
    }
  }

  /**
   * Distributed lock implementation
   */
  static async acquireLock(
    lockKey: string,
    ttl: number = 30,
    retryDelay: number = 100,
    maxRetries: number = 10
  ): Promise<string | null> {
    try {
      const redis = this.getRedis();
      const lockValue = `${Date.now()}-${Math.random()}`;
      
      for (let i = 0; i < maxRetries; i++) {
        const result = await redis.set(lockKey, lockValue, 'EX', ttl, 'NX');
        
        if (result === 'OK') {
          return lockValue;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
      
      return null;
    } catch (error) {
      console.error('Cache: Error acquiring lock:', error);
      return null;
    }
  }

  /**
   * Release distributed lock
   */
  static async releaseLock(lockKey: string, lockValue: string): Promise<boolean> {
    try {
      const redis = this.getRedis();
      
      // Lua script to ensure atomic release
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      
      const result = await redis.eval(script, 1, lockKey, lockValue);
      return result === 1;
    } catch (error) {
      console.error('Cache: Error releasing lock:', error);
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  static async close(): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.quit();
      }
    } catch (error) {
      console.error('Cache: Error closing connection:', error);
    }
  }
}

/**
 * Cache decorator for methods
 */
export function Cacheable(
  keyGenerator: (...args: any[]) => string,
  ttl: number = 3600
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = keyGenerator.apply(this, args);
      
      // Try to get from cache
      const cached = await CacheUtils.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Execute original method
      const result = await method.apply(this, args);
      
      // Cache the result
      await CacheUtils.set(cacheKey, result, ttl);
      
      return result;
    };
  };
}

/**
 * Cache invalidation decorator
 */
export function CacheInvalidate(
  keyGenerator: (...args: any[]) => string | string[]
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // Execute original method
      const result = await method.apply(this, args);
      
      // Invalidate cache
      const keys = keyGenerator.apply(this, args);
      if (Array.isArray(keys)) {
        await CacheUtils.delMany(keys);
      } else {
        await CacheUtils.del(keys);
      }
      
      return result;
    };
  };
}

/**
 * Common cache key generators
 */
export const CacheKeys = {
  user: (userId: string) => CacheUtils.createKey('user', userId),
  userProfile: (userId: string) => CacheUtils.createKey('user', 'profile', userId),
  session: (sessionId: string) => CacheUtils.createKey('session', sessionId),
  sessionsByMentor: (mentorId: string) => CacheUtils.createKey('sessions', 'mentor', mentorId),
  sessionsByStudent: (studentId: string) => CacheUtils.createKey('sessions', 'student', studentId),
  recommendations: (userId: string) => CacheUtils.createKey('recommendations', userId),
  searchResults: (query: string, filters: string) => CacheUtils.createKey('search', query, filters),
  apiResponse: (endpoint: string, params: string) => CacheUtils.createKey('api', endpoint, params)
};

/**
 * Cache warming utilities
 */
export class CacheWarmer {
  /**
   * Warm up user-related caches
   */
  static async warmUserCache(userId: string, userData: any): Promise<void> {
    const promises = [
      CacheUtils.set(CacheKeys.user(userId), userData, 3600),
      CacheUtils.set(CacheKeys.userProfile(userId), userData.profile, 3600)
    ];

    await Promise.allSettled(promises);
  }

  /**
   * Warm up session-related caches
   */
  static async warmSessionCache(sessionData: any): Promise<void> {
    const promises = [
      CacheUtils.set(CacheKeys.session(sessionData.id), sessionData, 1800),
      CacheUtils.set(CacheKeys.sessionsByMentor(sessionData.mentorId), [sessionData], 900)
    ];

    await Promise.allSettled(promises);
  }

  /**
   * Preload frequently accessed data
   */
  static async preloadFrequentData(): Promise<void> {
    // This would be implemented based on usage patterns
    console.log('Cache: Preloading frequent data...');
  }
}