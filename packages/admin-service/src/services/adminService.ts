import { DatabaseManager, DatabaseConfig, RedisConfig } from '@mentor-platform/shared';
import { AppError } from '../middleware/errorHandler';
import Redis from 'ioredis';
import { Pool } from 'pg';

// Database configuration
const dbConfig: DatabaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'mentor_platform',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
};

const pool = new Pool({
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.username,
  password: dbConfig.password,
  max: 20
});

export interface DashboardOverview {
  users: {
    total: number;
    active: number;
    mentors: number;
    students: number;
    newThisMonth: number;
  };
  sessions: {
    total: number;
    scheduled: number;
    completed: number;
    cancelled: number;
    completionRate: number;
  };
  system: {
    uptime: number;
    responseTime: number;
    errorRate: number;
    activeConnections: number;
  };
  revenue: {
    thisMonth: number;
    lastMonth: number;
    growth: number;
  };
}

export interface SystemStatus {
  services: {
    name: string;
    status: 'healthy' | 'degraded' | 'down';
    responseTime: number;
    lastCheck: Date;
  }[];
  database: {
    status: 'healthy' | 'degraded' | 'down';
    connections: number;
    queryTime: number;
  };
  cache: {
    status: 'healthy' | 'degraded' | 'down';
    memory: number;
    hitRate: number;
  };
  storage: {
    used: number;
    available: number;
    percentage: number;
  };
}

export class AdminService {
  private db: Pool;
  private redis: Redis;

  constructor() {
    this.db = pool;
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3
    });
  }

  /**
   * Get dashboard overview with key metrics
   */
  async getDashboardOverview(): Promise<DashboardOverview> {
    try {
      // Get user statistics
      const userStats = await this.db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN last_login_at > NOW() - INTERVAL '30 days' THEN 1 END) as active,
          COUNT(CASE WHEN role = 'MENTOR' THEN 1 END) as mentors,
          COUNT(CASE WHEN role = 'STUDENT' THEN 1 END) as students,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as new_this_month
        FROM users 
        WHERE deleted_at IS NULL
      `);

      // Get session statistics
      const sessionStats = await this.db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'SCHEDULED' THEN 1 END) as scheduled,
          COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled,
          ROUND(
            COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) * 100.0 / 
            NULLIF(COUNT(CASE WHEN status IN ('COMPLETED', 'CANCELLED') THEN 1 END), 0), 
            2
          ) as completion_rate
        FROM sessions 
        WHERE created_at > NOW() - INTERVAL '90 days'
      `);

      // Get system metrics from cache
      const systemMetrics = await this.getSystemMetrics();

      // Get revenue data (placeholder - would integrate with payment service)
      const revenueStats = await this.getRevenueStats();

      return {
        users: {
          total: parseInt(userStats.rows[0].total),
          active: parseInt(userStats.rows[0].active),
          mentors: parseInt(userStats.rows[0].mentors),
          students: parseInt(userStats.rows[0].students),
          newThisMonth: parseInt(userStats.rows[0].new_this_month)
        },
        sessions: {
          total: parseInt(sessionStats.rows[0].total),
          scheduled: parseInt(sessionStats.rows[0].scheduled),
          completed: parseInt(sessionStats.rows[0].completed),
          cancelled: parseInt(sessionStats.rows[0].cancelled),
          completionRate: parseFloat(sessionStats.rows[0].completion_rate) || 0
        },
        system: systemMetrics,
        revenue: revenueStats
      };
    } catch (error) {
      console.error('Error getting dashboard overview:', error);
      throw new AppError('Failed to get dashboard overview', 500, 'DASHBOARD_ERROR');
    }
  }

  /**
   * Get admin profile
   */
  async getAdminProfile(adminId: string): Promise<any> {
    try {
      const result = await this.db.query(`
        SELECT 
          u.id,
          u.email,
          u.role,
          u.created_at,
          u.last_login_at,
          ap.first_name,
          ap.last_name,
          ap.preferences,
          ap.last_activity_at
        FROM users u
        LEFT JOIN admin_profiles ap ON u.id = ap.user_id
        WHERE u.id = $1 AND u.role = 'ADMIN'
      `, [adminId]);

      if (result.rows.length === 0) {
        throw new AppError('Admin profile not found', 404, 'ADMIN_NOT_FOUND');
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('Error getting admin profile:', error);
      throw new AppError('Failed to get admin profile', 500, 'PROFILE_ERROR');
    }
  }

  /**
   * Update admin profile
   */
  async updateAdminProfile(adminId: string, updates: any): Promise<any> {
    try {
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        // Update user table if email is being changed
        if (updates.email) {
          await client.query(`
            UPDATE users 
            SET email = $1, updated_at = NOW()
            WHERE id = $2 AND role = 'ADMIN'
          `, [updates.email, adminId]);
        }

        // Update or insert admin profile
        const profileData = {
          firstName: updates.firstName,
          lastName: updates.lastName,
          preferences: updates.preferences
        };

        await client.query(`
          INSERT INTO admin_profiles (user_id, first_name, last_name, preferences, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (user_id) 
          DO UPDATE SET 
            first_name = COALESCE($2, admin_profiles.first_name),
            last_name = COALESCE($3, admin_profiles.last_name),
            preferences = COALESCE($4, admin_profiles.preferences),
            updated_at = NOW()
        `, [adminId, profileData.firstName, profileData.lastName, JSON.stringify(profileData.preferences)]);

        await client.query('COMMIT');

        // Return updated profile
        return await this.getAdminProfile(adminId);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error updating admin profile:', error);
      throw new AppError('Failed to update admin profile', 500, 'PROFILE_UPDATE_ERROR');
    }
  }

  /**
   * Get system status
   */
  async getSystemStatus(): Promise<SystemStatus> {
    try {
      // Check service health
      const services = await this.checkServiceHealth();

      // Check database health
      const dbHealth = await this.checkDatabaseHealth();

      // Check cache health
      const cacheHealth = await this.checkCacheHealth();

      // Check storage
      const storageInfo = await this.getStorageInfo();

      return {
        services,
        database: dbHealth,
        cache: cacheHealth,
        storage: storageInfo
      };
    } catch (error) {
      console.error('Error getting system status:', error);
      throw new AppError('Failed to get system status', 500, 'SYSTEM_STATUS_ERROR');
    }
  }

  /**
   * Get system health check
   */
  async getSystemHealth(): Promise<any> {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: await this.healthCheckDatabase(),
          cache: await this.healthCheckCache(),
          services: await this.healthCheckServices()
        }
      };

      // Determine overall health
      const hasUnhealthy = Object.values(health.checks).some(
        (check: any) => check.status !== 'healthy'
      );

      if (hasUnhealthy) {
        health.status = 'degraded';
      }

      return health;
    } catch (error) {
      console.error('Error getting system health:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get system configuration
   */
  async getSystemConfig(): Promise<any> {
    try {
      const result = await this.db.query(`
        SELECT config_key, config_value, updated_at, updated_by
        FROM system_config
        ORDER BY config_key
      `);

      const config: any = {};
      result.rows.forEach((row: any) => {
        const keys = row.config_key.split('.');
        let current = config;

        for (let i = 0; i < keys.length - 1; i++) {
          if (!current[keys[i]]) {
            current[keys[i]] = {};
          }
          current = current[keys[i]];
        }

        current[keys[keys.length - 1]] = JSON.parse(row.config_value);
      });

      return config;
    } catch (error) {
      console.error('Error getting system config:', error);
      throw new AppError('Failed to get system configuration', 500, 'CONFIG_ERROR');
    }
  }

  /**
   * Update system configuration
   */
  async updateSystemConfig(updates: any): Promise<any> {
    try {
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        // Flatten the config object and update each key
        const flattenConfig = (obj: any, prefix = ''): any[] => {
          const result: any[] = [];

          for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;

            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              result.push(...flattenConfig(value, fullKey));
            } else {
              result.push({ key: fullKey, value: JSON.stringify(value) });
            }
          }

          return result;
        };

        const configItems = flattenConfig(updates);

        for (const item of configItems) {
          await client.query(`
            INSERT INTO system_config (config_key, config_value, updated_at, updated_by)
            VALUES ($1, $2, NOW(), $3)
            ON CONFLICT (config_key)
            DO UPDATE SET 
              config_value = $2,
              updated_at = NOW(),
              updated_by = $3
          `, [item.key, item.value, 'admin']); // In real app, use actual admin ID
        }

        await client.query('COMMIT');

        // Clear config cache
        await this.redis.del('system:config');

        return await this.getSystemConfig();
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error updating system config:', error);
      throw new AppError('Failed to update system configuration', 500, 'CONFIG_UPDATE_ERROR');
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(recipients: any, notification: any): Promise<any> {
    try {
      // This would integrate with the notification service
      // For now, we'll simulate the process

      let targetUserIds: string[] = [];

      if (recipients.type === 'all') {
        const result = await this.db.query('SELECT id FROM users WHERE deleted_at IS NULL');
        targetUserIds = result.rows.map((row: any) => row.id);
      } else if (recipients.type === 'role') {
        const result = await this.db.query(
          'SELECT id FROM users WHERE role = ANY($1) AND deleted_at IS NULL',
          [recipients.roles]
        );
        targetUserIds = result.rows.map((row: any) => row.id);
      } else if (recipients.type === 'specific') {
        targetUserIds = recipients.userIds;
      }

      // Create notification records
      const notificationId = `bulk_${Date.now()}`;

      for (const userId of targetUserIds) {
        await this.db.query(`
          INSERT INTO notifications (id, user_id, type, title, message, channels, priority, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [
          `${notificationId}_${userId}`,
          userId,
          notification.type,
          notification.title,
          notification.message,
          JSON.stringify(notification.channels),
          notification.priority
        ]);
      }

      return {
        notificationId,
        recipientCount: targetUserIds.length,
        status: 'queued',
        scheduledAt: notification.scheduledAt || new Date()
      };
    } catch (error) {
      console.error('Error sending bulk notifications:', error);
      throw new AppError('Failed to send bulk notifications', 500, 'NOTIFICATION_ERROR');
    }
  }

  /**
   * Export system data
   */
  async exportData(params: any): Promise<any> {
    try {
      const exportId = `export_${Date.now()}`;

      // Create export job record
      await this.db.query(`
        INSERT INTO export_jobs (id, type, format, parameters, status, created_at)
        VALUES ($1, $2, $3, $4, 'processing', NOW())
      `, [exportId, params.type, params.format, JSON.stringify(params)]);

      // In a real implementation, this would be processed asynchronously
      // For now, we'll return the job information

      return {
        exportId,
        status: 'processing',
        estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        downloadUrl: `/api/admin/exports/${exportId}/download`
      };
    } catch (error) {
      console.error('Error creating export job:', error);
      throw new AppError('Failed to create export job', 500, 'EXPORT_ERROR');
    }
  }

  // Private helper methods
  private async getSystemMetrics(): Promise<any> {
    // This would integrate with monitoring systems
    return {
      uptime: process.uptime(),
      responseTime: 45, // ms
      errorRate: 0.1, // %
      activeConnections: 150
    };
  }

  private async getRevenueStats(): Promise<any> {
    // This would integrate with payment/billing service
    return {
      thisMonth: 12500,
      lastMonth: 11200,
      growth: 11.6
    };
  }

  private async checkServiceHealth(): Promise<any[]> {
    // This would check actual service endpoints
    return [
      { name: 'auth-service', status: 'healthy', responseTime: 23, lastCheck: new Date() },
      { name: 'user-service', status: 'healthy', responseTime: 31, lastCheck: new Date() },
      { name: 'session-service', status: 'healthy', responseTime: 28, lastCheck: new Date() },
      { name: 'notification-service', status: 'healthy', responseTime: 19, lastCheck: new Date() }
    ];
  }

  private async checkDatabaseHealth(): Promise<any> {
    try {
      const start = Date.now();
      await this.db.query('SELECT 1');
      const queryTime = Date.now() - start;

      const connections = await this.db.query('SELECT count(*) FROM pg_stat_activity');

      return {
        status: 'healthy',
        connections: parseInt(connections.rows[0].count),
        queryTime
      };
    } catch (error) {
      return {
        status: 'down',
        connections: 0,
        queryTime: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkCacheHealth(): Promise<any> {
    try {
      const info = await this.redis.info('memory');
      const memory = parseInt(info.split('\r\n').find(line => line.startsWith('used_memory:'))?.split(':')[1] || '0');

      // Test cache operation
      const start = Date.now();
      await this.redis.set('health_check', 'ok', 'EX', 1);
      await this.redis.get('health_check');
      const responseTime = Date.now() - start;

      return {
        status: 'healthy',
        memory,
        hitRate: 95.2, // Would calculate from actual stats
        responseTime
      };
    } catch (error) {
      return {
        status: 'down',
        memory: 0,
        hitRate: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getStorageInfo(): Promise<any> {
    // This would check actual storage usage
    return {
      used: 2.1, // GB
      available: 47.9, // GB
      percentage: 4.2
    };
  }

  private async healthCheckDatabase(): Promise<any> {
    try {
      await this.db.query('SELECT 1');
      return { status: 'healthy', responseTime: 12 };
    } catch (error) {
      return { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async healthCheckCache(): Promise<any> {
    try {
      await this.redis.ping();
      return { status: 'healthy', responseTime: 8 };
    } catch (error) {
      return { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async healthCheckServices(): Promise<any> {
    // This would check other microservices
    return { status: 'healthy', services: 4, unhealthy: 0 };
  }
}