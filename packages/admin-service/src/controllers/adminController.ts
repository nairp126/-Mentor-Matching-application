import { Request, Response, NextFunction } from 'express';
import { AdminService } from '../services/adminService';
import { AppError } from '../middleware/errorHandler';
import Joi from 'joi';

export class AdminController {
  private adminService: AdminService;

  constructor() {
    this.adminService = new AdminService();
  }

  /**
   * Get admin dashboard overview with key metrics
   */
  getDashboardOverview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const overview = await this.adminService.getDashboardOverview();
      
      res.json({
        success: true,
        data: overview,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get admin user profile
   */
  getAdminProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.admin) {
        throw new AppError('Admin authentication required', 401, 'ADMIN_AUTH_REQUIRED');
      }

      const profile = await this.adminService.getAdminProfile(req.admin.userId);
      
      res.json({
        success: true,
        data: profile,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update admin user profile
   */
  updateAdminProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.admin) {
        throw new AppError('Admin authentication required', 401, 'ADMIN_AUTH_REQUIRED');
      }

      const schema = Joi.object({
        firstName: Joi.string().min(1).max(50),
        lastName: Joi.string().min(1).max(50),
        email: Joi.string().email(),
        preferences: Joi.object({
          theme: Joi.string().valid('light', 'dark'),
          notifications: Joi.object({
            email: Joi.boolean(),
            browser: Joi.boolean(),
            mobile: Joi.boolean()
          }),
          dashboard: Joi.object({
            defaultView: Joi.string().valid('overview', 'users', 'sessions', 'metrics'),
            refreshInterval: Joi.number().min(5).max(300)
          })
        })
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError('Invalid profile data', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const updatedProfile = await this.adminService.updateAdminProfile(req.admin.userId, value);
      
      res.json({
        success: true,
        data: updatedProfile,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get system status
   */
  getSystemStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await this.adminService.getSystemStatus();
      
      res.json({
        success: true,
        data: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get system health check
   */
  getSystemHealth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const health = await this.adminService.getSystemHealth();
      
      res.json({
        success: true,
        data: health,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get system configuration
   */
  getSystemConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await this.adminService.getSystemConfig();
      
      res.json({
        success: true,
        data: config,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update system configuration
   */
  updateSystemConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        maintenance: Joi.object({
          enabled: Joi.boolean(),
          message: Joi.string().max(500),
          scheduledStart: Joi.date(),
          scheduledEnd: Joi.date()
        }),
        features: Joi.object({
          registration: Joi.boolean(),
          messaging: Joi.boolean(),
          videoCalls: Joi.boolean(),
          notifications: Joi.boolean()
        }),
        limits: Joi.object({
          maxSessionsPerMentor: Joi.number().min(1).max(100),
          maxStudentsPerSession: Joi.number().min(1).max(50),
          maxFileUploadSize: Joi.number().min(1).max(100),
          rateLimit: Joi.object({
            requests: Joi.number().min(10).max(10000),
            windowMs: Joi.number().min(1000).max(3600000)
          })
        }),
        notifications: Joi.object({
          emailEnabled: Joi.boolean(),
          smsEnabled: Joi.boolean(),
          pushEnabled: Joi.boolean(),
          defaultChannels: Joi.array().items(Joi.string().valid('EMAIL', 'SMS', 'PUSH', 'IN_APP'))
        })
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError('Invalid configuration data', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const updatedConfig = await this.adminService.updateSystemConfig(value);
      
      res.json({
        success: true,
        data: updatedConfig,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Send bulk notifications
   */
  sendBulkNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        recipients: Joi.object({
          type: Joi.string().valid('all', 'role', 'specific').required(),
          roles: Joi.array().items(Joi.string().valid('MENTOR', 'STUDENT')),
          userIds: Joi.array().items(Joi.string().uuid())
        }).required(),
        notification: Joi.object({
          title: Joi.string().min(1).max(100).required(),
          message: Joi.string().min(1).max(1000).required(),
          type: Joi.string().valid('INFO', 'WARNING', 'SUCCESS', 'ERROR').default('INFO'),
          channels: Joi.array().items(Joi.string().valid('EMAIL', 'IN_APP', 'SMS', 'PUSH')).default(['IN_APP']),
          priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT').default('MEDIUM'),
          scheduledAt: Joi.date().min('now')
        }).required()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError('Invalid notification data', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const result = await this.adminService.sendBulkNotifications(value.recipients, value.notification);
      
      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Export system data
   */
  exportData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        type: Joi.string().valid('users', 'sessions', 'messages', 'audit', 'all').required(),
        format: Joi.string().valid('csv', 'json', 'xlsx').default('csv'),
        dateRange: Joi.object({
          start: Joi.date().required(),
          end: Joi.date().min(Joi.ref('start')).required()
        }),
        filters: Joi.object({
          roles: Joi.array().items(Joi.string().valid('MENTOR', 'STUDENT', 'ADMIN')),
          status: Joi.array().items(Joi.string()),
          includeDeleted: Joi.boolean().default(false)
        })
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError('Invalid export parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const exportResult = await this.adminService.exportData(value);
      
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