import { AppError } from '../middleware/errorHandler';
import Redis from 'ioredis';
import { Pool } from 'pg';

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'mentor_platform',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20
});

export class SystemMetricsService {
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
   * Get real-time system metrics
   */
  async getRealtimeMetrics(): Promise<any> {
    try {
      const [
        systemLoad,
        memoryUsage,
        activeConnections,
        requestRate,
        errorRate
      ] = await Promise.all([
        this.getSystemLoad(),
        this.getMemoryUsage(),
        this.getActiveConnections(),
        this.getRequestRate(),
        this.getErrorRate()
      ]);

      return {
        system: {
          load: systemLoad,
          memory: memoryUsage,
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        },
        network: {
          activeConnections,
          requestRate,
          errorRate
        },
        services: await this.getServiceStatus()
      };
    } catch (error) {
      console.error('Error getting realtime metrics:', error);
      throw new AppError('Failed to get realtime metrics', 500, 'METRICS_ERROR');
    }
  }

  /**
   * Get performance metrics over time
   */
  async getPerformanceMetrics(timeRange: string, granularity: string): Promise<any> {
    try {
      const timeRangeMs = this.parseTimeRange(timeRange);
      const granularityMs = this.parseGranularity(granularity);

      const startTime = new Date(Date.now() - timeRangeMs);
      const endTime = new Date();

      // Generate time buckets
      const buckets = this.generateTimeBuckets(startTime, endTime, granularityMs);

      // Get metrics for each bucket
      const metrics = await Promise.all([
        this.getResponseTimeMetrics(buckets),
        this.getThroughputMetrics(buckets),
        this.getErrorRateMetrics(buckets),
        this.getCpuUsageMetrics(buckets),
        this.getMemoryUsageMetrics(buckets)
      ]);

      return {
        timeRange,
        granularity,
        buckets: buckets.map(bucket => bucket.toISOString()),
        metrics: {
          responseTime: metrics[0],
          throughput: metrics[1],
          errorRate: metrics[2],
          cpuUsage: metrics[3],
          memoryUsage: metrics[4]
        }
      };
    } catch (error) {
      console.error('Error getting performance metrics:', error);
      throw new AppError('Failed to get performance metrics', 500, 'PERFORMANCE_METRICS_ERROR');
    }
  }

  /**
   * Get API performance metrics
   */
  async getApiPerformanceMetrics(params: any): Promise<any> {
    try {
      const { timeRange, service, endpoint } = params;
      const timeRangeMs = this.parseTimeRange(timeRange);
      const startTime = new Date(Date.now() - timeRangeMs);

      let whereClause = 'WHERE created_at >= $1';
      const queryParams = [startTime];
      let paramIndex = 2;

      if (service) {
        whereClause += ` AND service = $${paramIndex}`;
        queryParams.push(service);
        paramIndex++;
      }

      if (endpoint) {
        whereClause += ` AND endpoint = $${paramIndex}`;
        queryParams.push(endpoint);
        paramIndex++;
      }

      const metricsQuery = `
        SELECT 
          service,
          endpoint,
          COUNT(*) as request_count,
          AVG(response_time) as avg_response_time,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time) as p50_response_time,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time) as p95_response_time,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time) as p99_response_time,
          COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count,
          COUNT(CASE WHEN status_code >= 400 THEN 1 END) * 100.0 / COUNT(*) as error_rate
        FROM api_metrics 
        ${whereClause}
        GROUP BY service, endpoint
        ORDER BY request_count DESC
        LIMIT 50
      `;

      const result = await this.db.query(metricsQuery, queryParams);

      // Get top slow endpoints
      const slowEndpointsQuery = `
        SELECT 
          service,
          endpoint,
          AVG(response_time) as avg_response_time,
          COUNT(*) as request_count
        FROM api_metrics 
        ${whereClause}
        GROUP BY service, endpoint
        HAVING AVG(response_time) > 1000
        ORDER BY avg_response_time DESC
        LIMIT 10
      `;

      const slowEndpoints = await this.db.query(slowEndpointsQuery, queryParams);

      return {
        overview: result.rows,
        slowEndpoints: slowEndpoints.rows,
        timeRange,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting API performance metrics:', error);
      throw new AppError('Failed to get API performance metrics', 500, 'API_METRICS_ERROR');
    }
  }

  /**
   * Get database performance metrics
   */
  async getDatabasePerformanceMetrics(timeRange: string): Promise<any> {
    try {
      const timeRangeMs = this.parseTimeRange(timeRange);
      const startTime = new Date(Date.now() - timeRangeMs);

      // Get database statistics
      const dbStats = await this.db.query(`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
        LIMIT 20
      `);

      // Get slow queries
      const slowQueries = await this.db.query(`
        SELECT 
          query,
          calls,
          total_time,
          mean_time,
          rows,
          100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
        FROM pg_stat_statements 
        WHERE mean_time > 100
        ORDER BY mean_time DESC 
        LIMIT 10
      `);

      // Get connection statistics
      const connectionStats = await this.db.query(`
        SELECT 
          state,
          COUNT(*) as count
        FROM pg_stat_activity 
        WHERE pid <> pg_backend_pid()
        GROUP BY state
      `);

      // Get database size information
      const dbSize = await this.db.query(`
        SELECT 
          pg_size_pretty(pg_database_size(current_database())) as database_size,
          pg_size_pretty(sum(pg_total_relation_size(schemaname||'.'||tablename))::bigint) as tables_size
        FROM pg_tables 
        WHERE schemaname = 'public'
      `);

      return {
        tableStats: dbStats.rows,
        slowQueries: slowQueries.rows,
        connections: connectionStats.rows,
        size: dbSize.rows[0],
        timeRange,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting database performance metrics:', error);
      throw new AppError('Failed to get database performance metrics', 500, 'DB_METRICS_ERROR');
    }
  }

  /**
   * Get user activity metrics
   */
  async getUserActivityMetrics(timeRange: string, breakdown: string): Promise<any> {
    try {
      const timeRangeMs = this.parseTimeRange(timeRange);
      const startTime = new Date(Date.now() - timeRangeMs);

      let dateFormat: string;
      switch (breakdown) {
        case 'hour':
          dateFormat = 'YYYY-MM-DD HH24:00:00';
          break;
        case 'day':
          dateFormat = 'YYYY-MM-DD';
          break;
        case 'week':
          dateFormat = 'YYYY-"W"WW';
          break;
        default:
          dateFormat = 'YYYY-MM-DD';
      }

      // Get user activity by time period
      const activityQuery = `
        SELECT 
          TO_CHAR(created_at, '${dateFormat}') as period,
          COUNT(DISTINCT user_id) as active_users,
          COUNT(*) as total_activities,
          COUNT(CASE WHEN activity_type = 'LOGIN' THEN 1 END) as logins,
          COUNT(CASE WHEN activity_type = 'SESSION_CREATE' THEN 1 END) as sessions_created,
          COUNT(CASE WHEN activity_type = 'MESSAGE_SENT' THEN 1 END) as messages_sent
        FROM user_activities 
        WHERE created_at >= $1
        GROUP BY TO_CHAR(created_at, '${dateFormat}')
        ORDER BY period
      `;

      const activityResult = await this.db.query(activityQuery, [startTime]);

      // Get user activity by role
      const roleActivityQuery = `
        SELECT 
          u.role,
          COUNT(DISTINCT ua.user_id) as active_users,
          COUNT(ua.*) as total_activities,
          AVG(CASE WHEN ua.activity_type = 'SESSION_DURATION' THEN ua.duration ELSE NULL END) as avg_session_duration
        FROM user_activities ua
        JOIN users u ON ua.user_id = u.id
        WHERE ua.created_at >= $1
        GROUP BY u.role
      `;

      const roleActivityResult = await this.db.query(roleActivityQuery, [startTime]);

      // Get top active users
      const topUsersQuery = `
        SELECT 
          u.id,
          u.email,
          u.role,
          COUNT(ua.*) as activity_count,
          MAX(ua.created_at) as last_activity
        FROM user_activities ua
        JOIN users u ON ua.user_id = u.id
        WHERE ua.created_at >= $1
        GROUP BY u.id, u.email, u.role
        ORDER BY activity_count DESC
        LIMIT 20
      `;

      const topUsersResult = await this.db.query(topUsersQuery, [startTime]);

      return {
        timeline: activityResult.rows,
        byRole: roleActivityResult.rows,
        topUsers: topUsersResult.rows,
        timeRange,
        breakdown,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting user activity metrics:', error);
      throw new AppError('Failed to get user activity metrics', 500, 'USER_ACTIVITY_METRICS_ERROR');
    }
  }

  /**
   * Get user engagement metrics
   */
  async getUserEngagementMetrics(timeRange: string, role?: string): Promise<any> {
    try {
      const timeRangeMs = this.parseTimeRange(timeRange);
      const startTime = new Date(Date.now() - timeRangeMs);

      let roleFilter = '';
      const queryParams: (Date | string)[] = [startTime];

      if (role) {
        roleFilter = 'AND u.role = $2';
        queryParams.push(role);
      }

      // Get engagement statistics
      const engagementQuery = `
        SELECT 
          COUNT(DISTINCT u.id) as total_users,
          COUNT(DISTINCT CASE WHEN u.last_login_at >= $1 THEN u.id END) as active_users,
          COUNT(DISTINCT CASE WHEN s.mentor_id IS NOT NULL OR sr.student_id IS NOT NULL THEN u.id END) as users_with_sessions,
          COUNT(DISTINCT CASE WHEN m.from_user_id IS NOT NULL THEN u.id END) as users_with_messages,
          AVG(CASE WHEN u.last_login_at >= $1 THEN 
            EXTRACT(EPOCH FROM (NOW() - u.last_login_at)) / 86400 
          END) as avg_days_since_last_login
        FROM users u
        LEFT JOIN sessions s ON u.id = s.mentor_id AND s.created_at >= $1
        LEFT JOIN session_registrations sr ON u.id = sr.student_id AND sr.created_at >= $1
        LEFT JOIN messages m ON u.id = m.from_user_id AND m.created_at >= $1
        WHERE u.deleted_at IS NULL ${roleFilter}
      `;

      const engagementResult = await this.db.query(engagementQuery, queryParams);

      // Get session engagement
      const sessionEngagementQuery = `
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_sessions,
          COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_sessions,
          AVG(duration) as avg_duration,
          AVG(CASE WHEN rating IS NOT NULL THEN rating END) as avg_rating
        FROM sessions s
        JOIN users u ON s.mentor_id = u.id
        WHERE s.created_at >= $1 ${roleFilter.replace('u.role', 's.mentor_id IN (SELECT id FROM users WHERE role')}
      `;

      const sessionEngagementResult = await this.db.query(sessionEngagementQuery, queryParams);

      // Get messaging engagement
      const messagingEngagementQuery = `
        SELECT 
          COUNT(*) as total_messages,
          COUNT(DISTINCT from_user_id) as unique_senders,
          COUNT(DISTINCT to_user_id) as unique_recipients,
          AVG(LENGTH(content)) as avg_message_length
        FROM messages m
        JOIN users u ON m.from_user_id = u.id
        WHERE m.created_at >= $1 ${roleFilter}
      `;

      const messagingEngagementResult = await this.db.query(messagingEngagementQuery, queryParams);

      return {
        overview: engagementResult.rows[0],
        sessions: sessionEngagementResult.rows[0],
        messaging: messagingEngagementResult.rows[0],
        timeRange,
        role,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting user engagement metrics:', error);
      throw new AppError('Failed to get user engagement metrics', 500, 'USER_ENGAGEMENT_METRICS_ERROR');
    }
  }

  /**
   * Get user retention metrics
   */
  async getUserRetentionMetrics(cohortPeriod: string, retentionPeriods: number): Promise<any> {
    try {
      // This is a complex query that would calculate cohort retention
      // For now, we'll return sample data structure
      const cohorts = [];
      const currentDate = new Date();

      for (let i = retentionPeriods; i >= 0; i--) {
        const cohortDate = new Date(currentDate);
        if (cohortPeriod === 'month') {
          cohortDate.setMonth(cohortDate.getMonth() - i);
        } else {
          cohortDate.setDate(cohortDate.getDate() - (i * 7));
        }

        // Sample retention data - in real implementation, this would be calculated from actual data
        const retentionRates = [];
        for (let period = 0; period < retentionPeriods; period++) {
          retentionRates.push(Math.max(0, 100 - (period * 15) + Math.random() * 10));
        }

        cohorts.push({
          cohortDate: cohortDate.toISOString().split('T')[0],
          userCount: Math.floor(Math.random() * 100) + 50,
          retentionRates
        });
      }

      return {
        cohortPeriod,
        retentionPeriods,
        cohorts,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting user retention metrics:', error);
      throw new AppError('Failed to get user retention metrics', 500, 'USER_RETENTION_METRICS_ERROR');
    }
  }

  /**
   * Get session overview metrics
   */
  async getSessionOverviewMetrics(timeRange: string): Promise<any> {
    try {
      const timeRangeMs = this.parseTimeRange(timeRange);
      const startTime = new Date(Date.now() - timeRangeMs);

      const overviewQuery = `
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN status = 'SCHEDULED' THEN 1 END) as scheduled_sessions,
          COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress_sessions,
          COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_sessions,
          COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_sessions,
          AVG(duration) as avg_duration,
          AVG(capacity) as avg_capacity,
          AVG(current_registrations) as avg_registrations,
          COUNT(DISTINCT mentor_id) as unique_mentors,
          SUM(current_registrations) as total_registrations
        FROM sessions 
        WHERE created_at >= $1
      `;

      const overviewResult = await this.db.query(overviewQuery, [startTime]);

      // Get sessions by type
      const sessionTypeQuery = `
        SELECT 
          session_type,
          COUNT(*) as count,
          AVG(duration) as avg_duration,
          AVG(current_registrations) as avg_registrations
        FROM sessions 
        WHERE created_at >= $1
        GROUP BY session_type
        ORDER BY count DESC
      `;

      const sessionTypeResult = await this.db.query(sessionTypeQuery, [startTime]);

      // Get sessions by expertise area
      const expertiseQuery = `
        SELECT 
          unnest(expertise_areas) as expertise_area,
          COUNT(*) as session_count,
          AVG(current_registrations) as avg_registrations
        FROM sessions 
        WHERE created_at >= $1
        GROUP BY expertise_area
        ORDER BY session_count DESC
        LIMIT 10
      `;

      const expertiseResult = await this.db.query(expertiseQuery, [startTime]);

      return {
        overview: overviewResult.rows[0],
        byType: sessionTypeResult.rows,
        byExpertise: expertiseResult.rows,
        timeRange,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting session overview metrics:', error);
      throw new AppError('Failed to get session overview metrics', 500, 'SESSION_OVERVIEW_METRICS_ERROR');
    }
  }

  // Additional methods would be implemented here following similar patterns...
  // For brevity, I'll provide placeholder implementations for the remaining methods

  async getSessionCompletionMetrics(timeRange: string, breakdown: string): Promise<any> {
    // Implementation would calculate completion rates over time
    return { timeRange, breakdown, data: [], generatedAt: new Date().toISOString() };
  }

  async getSessionRatingMetrics(timeRange: string, mentorId?: string): Promise<any> {
    // Implementation would calculate rating distributions and trends
    return { timeRange, mentorId, data: [], generatedAt: new Date().toISOString() };
  }

  async getServiceHealthMetrics(): Promise<any> {
    // Implementation would check health of all microservices
    return { services: [], generatedAt: new Date().toISOString() };
  }

  async getDatabaseHealthMetrics(): Promise<any> {
    // Implementation would check database health indicators
    return { health: 'good', metrics: {}, generatedAt: new Date().toISOString() };
  }

  async getCacheHealthMetrics(): Promise<any> {
    // Implementation would check Redis health and performance
    return { health: 'good', metrics: {}, generatedAt: new Date().toISOString() };
  }

  async getErrorMetrics(params: any): Promise<any> {
    // Implementation would aggregate error logs and metrics
    return { errors: [], trends: [], generatedAt: new Date().toISOString() };
  }

  async getErrorTrends(timeRange: string, granularity: string): Promise<any> {
    // Implementation would show error trends over time
    return { timeRange, granularity, trends: [], generatedAt: new Date().toISOString() };
  }

  async getActiveAlerts(params: any): Promise<any> {
    // Implementation would return active system alerts
    return { alerts: [], generatedAt: new Date().toISOString() };
  }

  async getCustomMetric(metricName: string, timeRange: string, filters: any): Promise<any> {
    // Implementation would return custom defined metrics
    return { metricName, timeRange, data: [], generatedAt: new Date().toISOString() };
  }

  async generateReport(params: any): Promise<any> {
    // Implementation would generate comprehensive reports
    const reportId = `report_${Date.now()}`;
    return { reportId, status: 'generating', estimatedCompletion: new Date(Date.now() + 300000) };
  }

  async getReport(reportId: string): Promise<any> {
    // Implementation would retrieve generated reports
    return { reportId, status: 'completed', data: {}, generatedAt: new Date().toISOString() };
  }

  // Private helper methods
  private parseTimeRange(timeRange: string): number {
    const timeRanges: { [key: string]: number } = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    };
    return timeRanges[timeRange] || timeRanges['24h'];
  }

  private parseGranularity(granularity: string): number {
    const granularities: { [key: string]: number } = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000
    };
    return granularities[granularity] || granularities['5m'];
  }

  private generateTimeBuckets(startTime: Date, endTime: Date, granularityMs: number): Date[] {
    const buckets: Date[] = [];
    let currentTime = new Date(startTime);

    while (currentTime < endTime) {
      buckets.push(new Date(currentTime));
      currentTime = new Date(currentTime.getTime() + granularityMs);
    }

    return buckets;
  }

  private async getSystemLoad(): Promise<any> {
    // Would integrate with system monitoring
    return { cpu: 45.2, memory: 67.8, disk: 23.1 };
  }

  private async getMemoryUsage(): Promise<any> {
    const memUsage = process.memoryUsage();
    return {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external
    };
  }

  private async getActiveConnections(): Promise<number> {
    // Would check actual connection pools
    return 150;
  }

  private async getRequestRate(): Promise<number> {
    // Would calculate from request logs
    return 45.2; // requests per second
  }

  private async getErrorRate(): Promise<number> {
    // Would calculate from error logs
    return 0.8; // percentage
  }

  private async getServiceStatus(): Promise<any[]> {
    // Would check health endpoints of all services
    return [
      { name: 'auth-service', status: 'healthy', responseTime: 23 },
      { name: 'user-service', status: 'healthy', responseTime: 31 },
      { name: 'session-service', status: 'healthy', responseTime: 28 }
    ];
  }

  // Placeholder implementations for metric collection methods
  private async getResponseTimeMetrics(buckets: Date[]): Promise<number[]> {
    return buckets.map(() => Math.random() * 100 + 50);
  }

  private async getThroughputMetrics(buckets: Date[]): Promise<number[]> {
    return buckets.map(() => Math.random() * 50 + 25);
  }

  private async getErrorRateMetrics(buckets: Date[]): Promise<number[]> {
    return buckets.map(() => Math.random() * 2);
  }

  private async getCpuUsageMetrics(buckets: Date[]): Promise<number[]> {
    return buckets.map(() => Math.random() * 40 + 30);
  }

  private async getMemoryUsageMetrics(buckets: Date[]): Promise<number[]> {
    return buckets.map(() => Math.random() * 30 + 50);
  }
}