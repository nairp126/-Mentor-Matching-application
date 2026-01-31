import { Request, Response, NextFunction } from 'express';
import { AuditService } from '../services/auditService';
import { AppError } from '../middleware/errorHandler';
import Joi from 'joi';

export class AuditController {
  private auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  /**
   * Get audit logs with filtering and pagination
   */
  getAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        logType: Joi.string().valid('USER_ACTION', 'ADMIN_ACTION', 'SYSTEM_EVENT', 'SECURITY_EVENT'),
        userId: Joi.string().uuid(),
        action: Joi.string(),
        dateRange: Joi.object({
          start: Joi.date(),
          end: Joi.date().min(Joi.ref('start'))
        }),
        severity: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
        sortBy: Joi.string().valid('created_at', 'log_type', 'action', 'severity').default('created_at'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const logs = await this.auditService.getAuditLogs(value);
      
      res.json({
        success: true,
        data: logs,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get specific audit log by ID
   */
  getAuditLogById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { logId } = req.params;
      
      const log = await this.auditService.getAuditLogById(logId);
      
      res.json({
        success: true,
        data: log,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get admin action logs
   */
  getAdminActionLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        adminId: Joi.string().uuid(),
        action: Joi.string(),
        dateRange: Joi.object({
          start: Joi.date(),
          end: Joi.date().min(Joi.ref('start'))
        }),
        targetUserId: Joi.string().uuid(),
        sortBy: Joi.string().valid('created_at', 'action', 'admin_id').default('created_at'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const logs = await this.auditService.getAdminActionLogs(value);
      
      res.json({
        success: true,
        data: logs,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get admin actions by specific admin user
   */
  getAdminActionsByUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { adminId } = req.params;
      
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        dateRange: Joi.object({
          start: Joi.date(),
          end: Joi.date().min(Joi.ref('start'))
        }),
        action: Joi.string()
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const logs = await this.auditService.getAdminActionsByUser(adminId, value);
      
      res.json({
        success: true,
        data: logs,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user activity logs
   */
  getUserActivityLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        userId: Joi.string().uuid(),
        activityType: Joi.string().valid('LOGIN', 'LOGOUT', 'PROFILE_UPDATE', 'SESSION_CREATE', 'MESSAGE_SENT'),
        dateRange: Joi.object({
          start: Joi.date(),
          end: Joi.date().min(Joi.ref('start'))
        }),
        ipAddress: Joi.string().ip(),
        sortBy: Joi.string().valid('created_at', 'activity_type', 'user_id').default('created_at'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const logs = await this.auditService.getUserActivityLogs(value);
      
      res.json({
        success: true,
        data: logs,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user activity by specific user ID
   */
  getUserActivityById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        dateRange: Joi.object({
          start: Joi.date(),
          end: Joi.date().min(Joi.ref('start'))
        }),
        activityType: Joi.string()
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const logs = await this.auditService.getUserActivityById(userId, value);
      
      res.json({
        success: true,
        data: logs,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get security event logs
   */
  getSecurityEventLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        eventType: Joi.string().valid('FAILED_LOGIN', 'SUSPICIOUS_ACTIVITY', 'UNAUTHORIZED_ACCESS', 'BRUTE_FORCE'),
        severity: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
        dateRange: Joi.object({
          start: Joi.date(),
          end: Joi.date().min(Joi.ref('start'))
        }),
        ipAddress: Joi.string().ip(),
        userId: Joi.string().uuid(),
        sortBy: Joi.string().valid('created_at', 'event_type', 'severity').default('created_at'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const logs = await this.auditService.getSecurityEventLogs(value);
      
      res.json({
        success: true,
        data: logs,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get failed login attempts
   */
  getFailedLoginAttempts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        dateRange: Joi.object({
          start: Joi.date(),
          end: Joi.date().min(Joi.ref('start'))
        }),
        ipAddress: Joi.string().ip(),
        email: Joi.string().email(),
        groupByIp: Joi.boolean().default(false)
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const logs = await this.auditService.getFailedLoginAttempts(value);
      
      res.json({
        success: true,
        data: logs,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get suspicious activity logs
   */
  getSuspiciousActivity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        dateRange: Joi.object({
          start: Joi.date(),
          end: Joi.date().min(Joi.ref('start'))
        }),
        riskScore: Joi.number().min(0).max(100),
        activityType: Joi.string()
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const logs = await this.auditService.getSuspiciousActivity(value);
      
      res.json({
        success: true,
        data: logs,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get system event logs
   */
  getSystemEventLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        eventType: Joi.string().valid('SERVICE_START', 'SERVICE_STOP', 'DATABASE_CONNECTION', 'CACHE_CLEAR'),
        service: Joi.string(),
        severity: Joi.string().valid('INFO', 'WARNING', 'ERROR', 'CRITICAL'),
        dateRange: Joi.object({
          start: Joi.date(),
          end: Joi.date().min(Joi.ref('start'))
        }),
        sortBy: Joi.string().valid('created_at', 'event_type', 'severity').default('created_at'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const logs = await this.auditService.getSystemEventLogs(value);
      
      res.json({
        success: true,
        data: logs,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get system errors
   */
  getSystemErrors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        dateRange: Joi.object({
          start: Joi.date(),
          end: Joi.date().min(Joi.ref('start'))
        }),
        service: Joi.string(),
        errorCode: Joi.string(),
        severity: Joi.string().valid('ERROR', 'CRITICAL'),
        resolved: Joi.boolean()
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const logs = await this.auditService.getSystemErrors(value);
      
      res.json({
        success: true,
        data: logs,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get data access logs
   */
  getDataAccessLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        userId: Joi.string().uuid(),
        resourceType: Joi.string().valid('USER_PROFILE', 'SESSION_DATA', 'MESSAGE_DATA', 'PAYMENT_DATA'),
        accessType: Joi.string().valid('READ', 'WRITE', 'DELETE'),
        dateRange: Joi.object({
          start: Joi.date(),
          end: Joi.date().min(Joi.ref('start'))
        }),
        sortBy: Joi.string().valid('created_at', 'resource_type', 'access_type').default('created_at'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const logs = await this.auditService.getDataAccessLogs(value);
      
      res.json({
        success: true,
        data: logs,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get sensitive data access logs
   */
  getSensitiveDataAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        dateRange: Joi.object({
          start: Joi.date(),
          end: Joi.date().min(Joi.ref('start'))
        }),
        userId: Joi.string().uuid(),
        dataType: Joi.string().valid('PII', 'FINANCIAL', 'HEALTH', 'AUTHENTICATION')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const logs = await this.auditService.getSensitiveDataAccess(value);
      
      res.json({
        success: true,
        data: logs,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Search audit logs
   */
  searchAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        query: Joi.string().min(1).max(200).required(),
        filters: Joi.object({
          logType: Joi.array().items(Joi.string()),
          dateRange: Joi.object({
            start: Joi.date(),
            end: Joi.date().min(Joi.ref('start'))
          }),
          severity: Joi.array().items(Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
          userId: Joi.string().uuid(),
          service: Joi.string()
        }),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20)
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError('Invalid search parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const results = await this.auditService.searchAuditLogs(value.query, value.filters, value.page, value.limit);
      
      res.json({
        success: true,
        data: results,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get audit statistics
   */
  getAuditStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        timeRange: Joi.string().valid('24h', '7d', '30d', '90d').default('30d')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const stats = await this.auditService.getAuditStats(value.timeRange);
      
      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get audit trends
   */
  getAuditTrends = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        timeRange: Joi.string().valid('7d', '30d', '90d').default('30d'),
        granularity: Joi.string().valid('hour', 'day', 'week').default('day')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const trends = await this.auditService.getAuditTrends(value.timeRange, value.granularity);
      
      res.json({
        success: true,
        data: trends,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get GDPR compliance report
   */
  getGDPRComplianceReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        dateRange: Joi.object({
          start: Joi.date(),
          end: Joi.date().min(Joi.ref('start'))
        }),
        userId: Joi.string().uuid()
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const report = await this.auditService.getGDPRComplianceReport(value);
      
      res.json({
        success: true,
        data: report,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get data retention report
   */
  getDataRetentionReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const report = await this.auditService.getDataRetentionReport();
      
      res.json({
        success: true,
        data: report,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Export audit data
   */
  exportAuditData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        format: Joi.string().valid('csv', 'json', 'xlsx').default('csv'),
        filters: Joi.object({
          logType: Joi.array().items(Joi.string()),
          dateRange: Joi.object({
            start: Joi.date().required(),
            end: Joi.date().min(Joi.ref('start')).required()
          }).required(),
          severity: Joi.array().items(Joi.string()),
          userId: Joi.string().uuid()
        }).required(),
        includePersonalData: Joi.boolean().default(false)
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError('Invalid export parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const exportResult = await this.auditService.exportAuditData(value);
      
      res.json({
        success: true,
        data: exportResult,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };
}