import { Request, Response, NextFunction } from 'express';
import { SystemMetricsService } from '../services/systemMetricsService';
import { AppError } from '../middleware/errorHandler';
import Joi from 'joi';

export class SystemMetricsController {
  private metricsService: SystemMetricsService;

  constructor() {
    this.metricsService = new SystemMetricsService();
  }

  /**
   * Get real-time system metrics
   */
  getRealtimeMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const metrics = await this.metricsService.getRealtimeMetrics();
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get performance metrics
   */
  getPerformanceMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        timeRange: Joi.string().valid('1h', '6h', '24h', '7d', '30d').default('24h'),
        granularity: Joi.string().valid('1m', '5m', '15m', '1h', '1d').default('5m')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const metrics = await this.metricsService.getPerformanceMetrics(value.timeRange, value.granularity);
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get API performance metrics
   */
  getApiPerformanceMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        timeRange: Joi.string().valid('1h', '6h', '24h', '7d').default('24h'),
        service: Joi.string(),
        endpoint: Joi.string()
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const metrics = await this.metricsService.getApiPerformanceMetrics(value);
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get database performance metrics
   */
  getDatabasePerformanceMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        timeRange: Joi.string().valid('1h', '6h', '24h', '7d').default('24h')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const metrics = await this.metricsService.getDatabasePerformanceMetrics(value.timeRange);
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user activity metrics
   */
  getUserActivityMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        timeRange: Joi.string().valid('24h', '7d', '30d', '90d').default('7d'),
        breakdown: Joi.string().valid('hour', 'day', 'week').default('day')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const metrics = await this.metricsService.getUserActivityMetrics(value.timeRange, value.breakdown);
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user engagement metrics
   */
  getUserEngagementMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        timeRange: Joi.string().valid('7d', '30d', '90d').default('30d'),
        role: Joi.string().valid('MENTOR', 'STUDENT')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const metrics = await this.metricsService.getUserEngagementMetrics(value.timeRange, value.role);
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user retention metrics
   */
  getUserRetentionMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        cohortPeriod: Joi.string().valid('week', 'month').default('month'),
        retentionPeriods: Joi.number().integer().min(1).max(12).default(6)
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const metrics = await this.metricsService.getUserRetentionMetrics(value.cohortPeriod, value.retentionPeriods);
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get session overview metrics
   */
  getSessionOverviewMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const metrics = await this.metricsService.getSessionOverviewMetrics(value.timeRange);
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get session completion metrics
   */
  getSessionCompletionMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        timeRange: Joi.string().valid('7d', '30d', '90d').default('30d'),
        breakdown: Joi.string().valid('day', 'week', 'month').default('day')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const metrics = await this.metricsService.getSessionCompletionMetrics(value.timeRange, value.breakdown);
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get session rating metrics
   */
  getSessionRatingMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        timeRange: Joi.string().valid('30d', '90d', '1y').default('90d'),
        mentorId: Joi.string().uuid()
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const metrics = await this.metricsService.getSessionRatingMetrics(value.timeRange, value.mentorId);
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get service health metrics
   */
  getServiceHealthMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const metrics = await this.metricsService.getServiceHealthMetrics();
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get database health metrics
   */
  getDatabaseHealthMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const metrics = await this.metricsService.getDatabaseHealthMetrics();
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get cache health metrics
   */
  getCacheHealthMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const metrics = await this.metricsService.getCacheHealthMetrics();
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get error metrics
   */
  getErrorMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        timeRange: Joi.string().valid('1h', '6h', '24h', '7d').default('24h'),
        service: Joi.string(),
        severity: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const metrics = await this.metricsService.getErrorMetrics(value);
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get error trends
   */
  getErrorTrends = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        timeRange: Joi.string().valid('24h', '7d', '30d').default('7d'),
        granularity: Joi.string().valid('1h', '1d').default('1h')
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const trends = await this.metricsService.getErrorTrends(value.timeRange, value.granularity);
      
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
   * Get active alerts
   */
  getActiveAlerts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        severity: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
        service: Joi.string(),
        limit: Joi.number().integer().min(1).max(100).default(50)
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const alerts = await this.metricsService.getActiveAlerts(value);
      
      res.json({
        success: true,
        data: alerts,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get custom metric
   */
  getCustomMetric = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { metricName } = req.params;
      
      const schema = Joi.object({
        timeRange: Joi.string().valid('1h', '6h', '24h', '7d', '30d').default('24h'),
        filters: Joi.object()
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const metric = await this.metricsService.getCustomMetric(metricName, value.timeRange, value.filters);
      
      res.json({
        success: true,
        data: metric,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Generate report
   */
  generateReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = Joi.object({
        reportType: Joi.string().valid('performance', 'users', 'sessions', 'errors', 'custom').required(),
        timeRange: Joi.string().valid('24h', '7d', '30d', '90d').required(),
        format: Joi.string().valid('json', 'csv', 'pdf').default('json'),
        filters: Joi.object(),
        schedule: Joi.object({
          enabled: Joi.boolean().default(false),
          frequency: Joi.string().valid('daily', 'weekly', 'monthly'),
          recipients: Joi.array().items(Joi.string().email())
        })
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError('Invalid report parameters', 400, 'VALIDATION_ERROR', {
          details: error.details
        });
      }

      const report = await this.metricsService.generateReport(value);
      
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
   * Get report
   */
  getReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reportId } = req.params;
      
      const report = await this.metricsService.getReport(reportId);
      
      res.json({
        success: true,
        data: report,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  };
}