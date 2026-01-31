import { Request, Response, NextFunction } from 'express';
import { UserManagementService } from '../services/userManagementService';
import { AppError } from '../middleware/errorHandler';
import Joi from 'joi';

export class UserManagementController {
  private userService: UserManagementService;

  constructor() {
    this.userService = new UserManagementService();
  }

  /**
   * Get paginated list of users with filtering
   */
  getUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        role: Joi.string().valid('MENTOR', 'STUDENT', 'ADMIN'),
        status: Joi.string().valid('ACTIVE', 'SUSPENDED', 'DELETED'),
        sortBy: Joi.string().valid('createdAt', 'lastLoginAt', 'email', 'firstName', 'lastName').default('createdAt'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
        search: Joi.string().max(100)
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const users = await this.userService.getUsers(value);
      
      res.json({
        success: true,
        data: users,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Search users by various criteria
   */
  searchUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        query: Joi.string().min(1).max(100).required(),
        filters: Joi.object({
          role: Joi.array().items(Joi.string().valid('MENTOR', 'STUDENT', 'ADMIN')),
          status: Joi.array().items(Joi.string().valid('ACTIVE', 'SUSPENDED', 'DELETED')),
          dateRange: Joi.object({
            start: Joi.date(),
            end: Joi.date().min(Joi.ref('start'))
          }),
          expertiseAreas: Joi.array().items(Joi.string()),
          location: Joi.string()
        }),
        limit: Joi.number().integer().min(1).max(50).default(20)
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid search parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const results = await this.userService.searchUsers(value.query, value.filters, value.limit);
      
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
   * Get detailed user information by ID
   */
  getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
      }

      const user = await this.userService.getUserById(userId);
      
      res.json({
        success: true,
        data: user,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update user information
   */
  updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      
      const schema = Joi.object({
        email: Joi.string().email(),
        role: Joi.string().valid('MENTOR', 'STUDENT', 'ADMIN'),
        emailVerified: Joi.boolean(),
        profile: Joi.object({
          firstName: Joi.string().min(1).max(50),
          lastName: Joi.string().min(1).max(50),
          bio: Joi.string().max(1000),
          expertiseAreas: Joi.array().items(Joi.string()),
          yearsOfExperience: Joi.number().min(0).max(50),
          hourlyRate: Joi.number().min(0),
          learningGoals: Joi.array().items(Joi.string()),
          interests: Joi.array().items(Joi.string()),
          currentLevel: Joi.string().valid('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT')
        }),
        status: Joi.string().valid('ACTIVE', 'SUSPENDED'),
        notes: Joi.string().max(1000)
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError('Invalid user data', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const updatedUser = await this.userService.updateUser(userId, value);
      
      res.json({
        success: true,
        data: updatedUser,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete user (soft delete)
   */
  deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      const { permanent } = req.query;
      
      const result = await this.userService.deleteUser(userId, permanent === 'true');
      
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
   * Suspend user account
   */
  suspendUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      
      const schema = Joi.object({
        reason: Joi.string().min(10).max(500).required(),
        duration: Joi.number().min(1).max(365), // days
        notifyUser: Joi.boolean().default(true)
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError('Invalid suspension data', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const result = await this.userService.suspendUser(userId, value);
      
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
   * Activate suspended user account
   */
  activateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      
      const schema = Joi.object({
        reason: Joi.string().max(500),
        notifyUser: Joi.boolean().default(true)
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError('Invalid activation data', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const result = await this.userService.activateUser(userId, value);
      
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
   * Reset user password
   */
  resetUserPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      
      const schema = Joi.object({
        temporaryPassword: Joi.string().min(8),
        forceReset: Joi.boolean().default(true),
        notifyUser: Joi.boolean().default(true)
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError('Invalid password reset data', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const result = await this.userService.resetUserPassword(userId, value);
      
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
   * Get user activity history
   */
  getUserActivity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        activityType: Joi.string().valid('LOGIN', 'SESSION', 'MESSAGE', 'PROFILE_UPDATE'),
        dateRange: Joi.object({
          start: Joi.date(),
          end: Joi.date().min(Joi.ref('start'))
        })
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid activity query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const activity = await this.userService.getUserActivity(userId, value);
      
      res.json({
        success: true,
        data: activity,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user sessions
   */
  getUserSessions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        status: Joi.string().valid('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'),
        role: Joi.string().valid('MENTOR', 'STUDENT')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid session query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const sessions = await this.userService.getUserSessions(userId, value);
      
      res.json({
        success: true,
        data: sessions,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user messages
   */
  getUserMessages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        conversationId: Joi.string().uuid()
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid message query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const messages = await this.userService.getUserMessages(userId, value);
      
      res.json({
        success: true,
        data: messages,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Bulk suspend users
   */
  bulkSuspendUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        userIds: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
        reason: Joi.string().min(10).max(500).required(),
        duration: Joi.number().min(1).max(365),
        notifyUsers: Joi.boolean().default(true)
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError('Invalid bulk suspension data', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const result = await this.userService.bulkSuspendUsers(value);
      
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
   * Bulk activate users
   */
  bulkActivateUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        userIds: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
        reason: Joi.string().max(500),
        notifyUsers: Joi.boolean().default(true)
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError('Invalid bulk activation data', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const result = await this.userService.bulkActivateUsers(value);
      
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
   * Bulk notify users
   */
  bulkNotifyUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        userIds: Joi.array().items(Joi.string().uuid()).min(1).max(1000).required(),
        notification: Joi.object({
          title: Joi.string().min(1).max(100).required(),
          message: Joi.string().min(1).max(1000).required(),
          type: Joi.string().valid('INFO', 'WARNING', 'SUCCESS', 'ERROR').default('INFO'),
          channels: Joi.array().items(Joi.string().valid('EMAIL', 'IN_APP', 'SMS', 'PUSH')).default(['IN_APP'])
        }).required()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError('Invalid bulk notification data', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const result = await this.userService.bulkNotifyUsers(value);
      
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
   * Get user statistics overview
   */
  getUserStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await this.userService.getUserStats();
      
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
   * Get user growth statistics
   */
  getUserGrowthStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        period: Joi.string().valid('day', 'week', 'month', 'year').default('month'),
        range: Joi.number().integer().min(1).max(24).default(12)
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid growth stats parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const stats = await this.userService.getUserGrowthStats(value.period, value.range);
      
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
   * Get user engagement statistics
   */
  getUserEngagementStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        period: Joi.string().valid('day', 'week', 'month').default('week'),
        role: Joi.string().valid('MENTOR', 'STUDENT')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid engagement stats parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const stats = await this.userService.getUserEngagementStats(value.period, value.role);
      
      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };
}