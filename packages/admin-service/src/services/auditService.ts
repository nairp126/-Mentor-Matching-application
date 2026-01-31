import { PaginatedResponse } from '@mentor-platform/shared';
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

export class AuditService {
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
   * Get audit logs with filtering and pagination
   */
  async getAuditLogs(params: any): Promise<PaginatedResponse<any>> {
    try {
      const { page, limit, logType, userId, action, dateRange, severity, sortBy, sortOrder } = params;
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE 1=1';
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (logType) {
        whereClause += ` AND log_type = $${paramIndex}`;
        queryParams.push(logType);
        paramIndex++;
      }

      if (userId) {
        whereClause += ` AND user_id = $${paramIndex}`;
        queryParams.push(userId);
        paramIndex++;
      }

      if (action) {
        whereClause += ` AND action ILIKE $${paramIndex}`;
        queryParams.push(`%${action}%`);
        paramIndex++;
      }

      if (dateRange) {
        whereClause += ` AND created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
        queryParams.push(dateRange.start, dateRange.end);
        paramIndex += 2;
      }

      if (severity) {
        whereClause += ` AND severity = $${paramIndex}`;
        queryParams.push(severity);
        paramIndex++;
      }

      // Build ORDER BY clause
      const validSortFields: Record<string, string> = {
        created_at: 'created_at',
        log_type: 'log_type',
        action: 'action',
        severity: 'severity'
      };

      const orderBy = validSortFields[sortBy] || 'created_at';
      const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      // Get total count
      const countQuery = `
        SELECT COUNT(*)
        FROM audit_logs
        ${whereClause}
      `;

      const countResult = await this.db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);

      // Get audit logs
      const logsQuery = `
        SELECT 
          al.*,
          u.email as user_email,
          u.role as user_role
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ${whereClause}
        ORDER BY ${orderBy} ${order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);
      const logsResult = await this.db.query(logsQuery, queryParams);

      return {
        items: logsResult.rows,
        total,
        page,
        limit,
        hasNext: offset + limit < total,
        hasPrev: page > 1
      };
    } catch (error) {
      console.error('Error getting audit logs:', error);
      throw new AppError('Failed to get audit logs', 500, 'AUDIT_LOGS_ERROR');
    }
  }

  /**
   * Get specific audit log by ID
   */
  async getAuditLogById(logId: string): Promise<any> {
    try {
      const query = `
        SELECT 
          al.*,
          u.email as user_email,
          u.role as user_role,
          au.email as admin_email
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN users au ON al.admin_id = au.id
        WHERE al.id = $1
      `;

      const result = await this.db.query(query, [logId]);

      if (result.rows.length === 0) {
        throw new AppError('Audit log not found', 404, 'AUDIT_LOG_NOT_FOUND');
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('Error getting audit log by ID:', error);
      throw new AppError('Failed to get audit log', 500, 'AUDIT_LOG_ERROR');
    }
  }

  /**
   * Get admin action logs
   */
  async getAdminActionLogs(params: any): Promise<PaginatedResponse<any>> {
    try {
      const { page, limit, adminId, action, dateRange, targetUserId, sortBy, sortOrder } = params;
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE aa.admin_id IS NOT NULL';
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (adminId) {
        whereClause += ` AND aa.admin_id = $${paramIndex}`;
        queryParams.push(adminId);
        paramIndex++;
      }

      if (action) {
        whereClause += ` AND aa.action ILIKE $${paramIndex}`;
        queryParams.push(`%${action}%`);
        paramIndex++;
      }

      if (dateRange) {
        whereClause += ` AND aa.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
        queryParams.push(dateRange.start, dateRange.end);
        paramIndex += 2;
      }

      if (targetUserId) {
        whereClause += ` AND aa.target_user_id = $${paramIndex}`;
        queryParams.push(targetUserId);
        paramIndex++;
      }

      // Build ORDER BY clause
      const validSortFields: Record<string, string> = {
        created_at: 'aa.created_at',
        action: 'aa.action',
        admin_id: 'aa.admin_id'
      };

      const orderBy = validSortFields[sortBy] || 'aa.created_at';
      const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      // Get total count
      const countQuery = `
        SELECT COUNT(*)
        FROM admin_actions aa
        ${whereClause}
      `;

      const countResult = await this.db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);

      // Get admin actions
      const actionsQuery = `
        SELECT 
          aa.*,
          au.email as admin_email,
          au.role as admin_role,
          tu.email as target_user_email,
          tu.role as target_user_role
        FROM admin_actions aa
        LEFT JOIN users au ON aa.admin_id = au.id
        LEFT JOIN users tu ON aa.target_user_id = tu.id
        ${whereClause}
        ORDER BY ${orderBy} ${order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);
      const actionsResult = await this.db.query(actionsQuery, queryParams);

      return {
        items: actionsResult.rows,
        total,
        page,
        limit,
        hasNext: offset + limit < total,
        hasPrev: page > 1
      };
    } catch (error) {
      console.error('Error getting admin action logs:', error);
      throw new AppError('Failed to get admin action logs', 500, 'ADMIN_ACTION_LOGS_ERROR');
    }
  }

  /**
   * Get admin actions by specific admin user
   */
  async getAdminActionsByUser(adminId: string, params: any): Promise<PaginatedResponse<any>> {
    try {
      const { page, limit, dateRange, action } = params;
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE aa.admin_id = $1';
      const queryParams: any[] = [adminId];
      let paramIndex = 2;

      // Add filters
      if (dateRange) {
        whereClause += ` AND aa.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
        queryParams.push(dateRange.start, dateRange.end);
        paramIndex += 2;
      }

      if (action) {
        whereClause += ` AND aa.action ILIKE $${paramIndex}`;
        queryParams.push(`%${action}%`);
        paramIndex++;
      }

      // Get total count
      const countQuery = `
        SELECT COUNT(*)
        FROM admin_actions aa
        ${whereClause}
      `;

      const countResult = await this.db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);

      // Get admin actions
      const actionsQuery = `
        SELECT 
          aa.*,
          tu.email as target_user_email,
          tu.role as target_user_role
        FROM admin_actions aa
        LEFT JOIN users tu ON aa.target_user_id = tu.id
        ${whereClause}
        ORDER BY aa.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);
      const actionsResult = await this.db.query(actionsQuery, queryParams);

      return {
        items: actionsResult.rows,
        total,
        page,
        limit,
        hasNext: offset + limit < total,
        hasPrev: page > 1
      };
    } catch (error) {
      console.error('Error getting admin actions by user:', error);
      throw new AppError('Failed to get admin actions by user', 500, 'ADMIN_ACTIONS_BY_USER_ERROR');
    }
  }

  /**
   * Get user activity logs
   */
  async getUserActivityLogs(params: any): Promise<PaginatedResponse<any>> {
    try {
      const { page, limit, userId, activityType, dateRange, ipAddress, sortBy, sortOrder } = params;
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE 1=1';
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (userId) {
        whereClause += ` AND ua.user_id = $${paramIndex}`;
        queryParams.push(userId);
        paramIndex++;
      }

      if (activityType) {
        whereClause += ` AND ua.activity_type = $${paramIndex}`;
        queryParams.push(activityType);
        paramIndex++;
      }

      if (dateRange) {
        whereClause += ` AND ua.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
        queryParams.push(dateRange.start, dateRange.end);
        paramIndex += 2;
      }

      if (ipAddress) {
        whereClause += ` AND ua.ip_address = $${paramIndex}`;
        queryParams.push(ipAddress);
        paramIndex++;
      }

      // Build ORDER BY clause
      const validSortFields: Record<string, string> = {
        created_at: 'ua.created_at',
        activity_type: 'ua.activity_type',
        user_id: 'ua.user_id'
      };

      const orderBy = validSortFields[sortBy] || 'ua.created_at';
      const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      // Get total count
      const countQuery = `
        SELECT COUNT(*)
        FROM user_activities ua
        ${whereClause}
      `;

      const countResult = await this.db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);

      // Get user activities
      const activitiesQuery = `
        SELECT 
          ua.*,
          u.email as user_email,
          u.role as user_role
        FROM user_activities ua
        LEFT JOIN users u ON ua.user_id = u.id
        ${whereClause}
        ORDER BY ${orderBy} ${order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);
      const activitiesResult = await this.db.query(activitiesQuery, queryParams);

      return {
        items: activitiesResult.rows,
        total,
        page,
        limit,
        hasNext: offset + limit < total,
        hasPrev: page > 1
      };
    } catch (error) {
      console.error('Error getting user activity logs:', error);
      throw new AppError('Failed to get user activity logs', 500, 'USER_ACTIVITY_LOGS_ERROR');
    }
  }

  /**
   * Get user activity by specific user ID
   */
  async getUserActivityById(userId: string, params: any): Promise<PaginatedResponse<any>> {
    try {
      const { page, limit, dateRange, activityType } = params;
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE ua.user_id = $1';
      const queryParams: any[] = [userId];
      let paramIndex = 2;

      // Add filters
      if (dateRange) {
        whereClause += ` AND ua.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
        queryParams.push(dateRange.start, dateRange.end);
        paramIndex += 2;
      }

      if (activityType) {
        whereClause += ` AND ua.activity_type = $${paramIndex}`;
        queryParams.push(activityType);
        paramIndex++;
      }

      // Get total count
      const countQuery = `
        SELECT COUNT(*)
        FROM user_activities ua
        ${whereClause}
      `;

      const countResult = await this.db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);

      // Get user activities
      const activitiesQuery = `
        SELECT ua.*
        FROM user_activities ua
        ${whereClause}
        ORDER BY ua.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);
      const activitiesResult = await this.db.query(activitiesQuery, queryParams);

      return {
        items: activitiesResult.rows,
        total,
        page,
        limit,
        hasNext: offset + limit < total,
        hasPrev: page > 1
      };
    } catch (error) {
      console.error('Error getting user activity by ID:', error);
      throw new AppError('Failed to get user activity by ID', 500, 'USER_ACTIVITY_BY_ID_ERROR');
    }
  }

  /**
   * Get security event logs
   */
  async getSecurityEventLogs(params: any): Promise<PaginatedResponse<any>> {
    try {
      const { page, limit, eventType, severity, dateRange, ipAddress, userId, sortBy, sortOrder } = params;
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE 1=1';
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (eventType) {
        whereClause += ` AND se.event_type = $${paramIndex}`;
        queryParams.push(eventType);
        paramIndex++;
      }

      if (severity) {
        whereClause += ` AND se.severity = $${paramIndex}`;
        queryParams.push(severity);
        paramIndex++;
      }

      if (dateRange) {
        whereClause += ` AND se.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
        queryParams.push(dateRange.start, dateRange.end);
        paramIndex += 2;
      }

      if (ipAddress) {
        whereClause += ` AND se.ip_address = $${paramIndex}`;
        queryParams.push(ipAddress);
        paramIndex++;
      }

      if (userId) {
        whereClause += ` AND se.user_id = $${paramIndex}`;
        queryParams.push(userId);
        paramIndex++;
      }

      // Build ORDER BY clause
      const validSortFields: Record<string, string> = {
        created_at: 'se.created_at',
        event_type: 'se.event_type',
        severity: 'se.severity'
      };
      const orderBy = validSortFields[sortBy] || 'se.created_at';
      const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      // Get total count
      const countQuery = `
        SELECT COUNT(*)
        FROM security_events se
        ${whereClause}
      `;

      const countResult = await this.db.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);

      // Get security events
      const eventsQuery = `
        SELECT 
          se.*,
          u.email as user_email,
          u.role as user_role
        FROM security_events se
        LEFT JOIN users u ON se.user_id = u.id
        ${whereClause}
        ORDER BY ${orderBy} ${order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);
      const eventsResult = await this.db.query(eventsQuery, queryParams);

      return {
        items: eventsResult.rows,
        total,
        page,
        limit,
        hasNext: offset + limit < total,
        hasPrev: page > 1
      };
    } catch (error) {
      console.error('Error getting security event logs:', error);
      throw new AppError('Failed to get security event logs', 500, 'SECURITY_EVENT_LOGS_ERROR');
    }
  }

  // Additional methods would be implemented here following similar patterns...
  // For brevity, I'll provide placeholder implementations for the remaining methods

  async getFailedLoginAttempts(params: any): Promise<PaginatedResponse<any>> {
    // Implementation would query failed login attempts
    return { items: [], total: 0, page: 1, limit: 20, hasNext: false, hasPrev: false };
  }

  async getSuspiciousActivity(params: any): Promise<PaginatedResponse<any>> {
    // Implementation would query suspicious activity logs
    return { items: [], total: 0, page: 1, limit: 20, hasNext: false, hasPrev: false };
  }

  async getSystemEventLogs(params: any): Promise<PaginatedResponse<any>> {
    // Implementation would query system event logs
    return { items: [], total: 0, page: 1, limit: 20, hasNext: false, hasPrev: false };
  }

  async getSystemErrors(params: any): Promise<PaginatedResponse<any>> {
    // Implementation would query system error logs
    return { items: [], total: 0, page: 1, limit: 20, hasNext: false, hasPrev: false };
  }

  async getDataAccessLogs(params: any): Promise<PaginatedResponse<any>> {
    // Implementation would query data access logs
    return { items: [], total: 0, page: 1, limit: 20, hasNext: false, hasPrev: false };
  }

  async getSensitiveDataAccess(params: any): Promise<PaginatedResponse<any>> {
    // Implementation would query sensitive data access logs
    return { items: [], total: 0, page: 1, limit: 20, hasNext: false, hasPrev: false };
  }

  async searchAuditLogs(query: string, filters: any, page: number, limit: number): Promise<PaginatedResponse<any>> {
    // Implementation would perform full-text search on audit logs
    return { items: [], total: 0, page, limit, hasNext: false, hasPrev: false };
  }

  async getAuditStats(timeRange: string): Promise<any> {
    try {
      const timeRangeMs = this.parseTimeRange(timeRange);
      const startTime = new Date(Date.now() - timeRangeMs);

      const statsQuery = `
        SELECT 
          COUNT(*) as total_logs,
          COUNT(CASE WHEN log_type = 'USER_ACTION' THEN 1 END) as user_actions,
          COUNT(CASE WHEN log_type = 'ADMIN_ACTION' THEN 1 END) as admin_actions,
          COUNT(CASE WHEN log_type = 'SYSTEM_EVENT' THEN 1 END) as system_events,
          COUNT(CASE WHEN log_type = 'SECURITY_EVENT' THEN 1 END) as security_events,
          COUNT(CASE WHEN severity = 'CRITICAL' THEN 1 END) as critical_events,
          COUNT(CASE WHEN severity = 'HIGH' THEN 1 END) as high_severity_events,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT ip_address) as unique_ips
        FROM audit_logs 
        WHERE created_at >= $1
      `;

      const result = await this.db.query(statsQuery, [startTime]);

      return {
        ...result.rows[0],
        timeRange,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting audit stats:', error);
      throw new AppError('Failed to get audit statistics', 500, 'AUDIT_STATS_ERROR');
    }
  }

  async getAuditTrends(timeRange: string, granularity: string): Promise<any> {
    // Implementation would calculate audit trends over time
    return { timeRange, granularity, trends: [], generatedAt: new Date().toISOString() };
  }

  async getGDPRComplianceReport(params: any): Promise<any> {
    // Implementation would generate GDPR compliance report
    return { compliance: 'good', details: {}, generatedAt: new Date().toISOString() };
  }

  async getDataRetentionReport(): Promise<any> {
    // Implementation would generate data retention report
    return { retention: 'compliant', details: {}, generatedAt: new Date().toISOString() };
  }

  async exportAuditData(params: any): Promise<any> {
    // Implementation would export audit data in specified format
    const exportId = `audit_export_${Date.now()}`;
    return {
      exportId,
      status: 'processing',
      estimatedCompletion: new Date(Date.now() + 300000),
      downloadUrl: `/api/admin/audit/exports/${exportId}/download`
    };
  }

  // Private helper methods
  private parseTimeRange(timeRange: string): number {
    const timeRanges: { [key: string]: number } = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    };
    return timeRanges[timeRange] || timeRanges['30d'];
  }
}