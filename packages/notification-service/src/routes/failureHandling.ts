import { Router, Response } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import Joi from 'joi';
import { FailureHandlingService } from '../services/failureHandlingService';
import { authMiddleware, AuthenticatedRequest } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validation';
import { ApiResponse } from '@mentor-platform/shared';

export function createFailureHandlingRoutes(
  db: Pool,
  redis: Redis,
  failureHandlingService: FailureHandlingService
): Router {
  const router = Router();

  // Validation schemas
  const rateLimitSchema = Joi.object({
    notificationId: Joi.string().uuid().required(),
    channel: Joi.string().valid('EMAIL', 'SMS', 'IN_APP', 'PUSH').required(),
    retryAfterSeconds: Joi.number().integer().min(1).max(3600).required()
  });

  const circuitBreakerSchema = Joi.object({
    service: Joi.string().min(1).max(50).required()
  });

  /**
   * Process failed notifications manually (admin only)
   * POST /api/failure-handling/process-failed
   */
  router.post('/process-failed',
    authMiddleware,
    async (req, res) => {
      try {
        if (req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only administrators can process failed notifications'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const results = await failureHandlingService.processFailedNotifications();

        res.json({
          success: true,
          data: {
            ...results,
            message: 'Failed notifications processed successfully'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error processing failed notifications:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to process failed notifications'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Handle rate limit for a notification
   * POST /api/failure-handling/rate-limit
   */
  router.post('/rate-limit',
    authMiddleware,
    validateRequest(rateLimitSchema),
    async (req, res) => {
      try {
        if (req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only administrators can handle rate limits'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const { notificationId, channel, retryAfterSeconds } = req.body;

        await failureHandlingService.handleRateLimit(notificationId, channel, retryAfterSeconds);

        res.json({
          success: true,
          data: {
            message: 'Rate limit handled successfully',
            retryAfter: new Date(Date.now() + retryAfterSeconds * 1000).toISOString()
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error handling rate limit:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to handle rate limit'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Check circuit breaker status for a service
   * GET /api/failure-handling/circuit-breaker/:service
   */
  router.get('/circuit-breaker/:service',
    authMiddleware,
    async (req, res) => {
      try {
        if (req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only administrators can check circuit breaker status'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const service = req.params.service;
        const status = await failureHandlingService.checkCircuitBreaker(service);

        res.json({
          success: true,
          data: {
            service,
            ...status
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error checking circuit breaker:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to check circuit breaker status'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Reset circuit breaker for a service
   * POST /api/failure-handling/circuit-breaker/:service/reset
   */
  router.post('/circuit-breaker/:service/reset',
    authMiddleware,
    async (req, res) => {
      try {
        if (req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only administrators can reset circuit breakers'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const service = req.params.service;
        await failureHandlingService.resetCircuitBreaker(service);

        res.json({
          success: true,
          data: {
            service,
            message: 'Circuit breaker reset successfully'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error resetting circuit breaker:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to reset circuit breaker'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get failure statistics
   * GET /api/failure-handling/stats
   */
  router.get('/stats',
    authMiddleware,
    async (req, res) => {
      try {
        if (req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only administrators can view failure statistics'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const timeRangeHours = parseInt(req.query.hours as string) || 24;
        const stats = await failureHandlingService.getFailureStats(timeRangeHours);

        res.json({
          success: true,
          data: {
            timeRangeHours,
            ...stats
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting failure statistics:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get failure statistics'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get escalated notifications
   * GET /api/failure-handling/escalations
   */
  router.get('/escalations',
    authMiddleware,
    async (req, res) => {
      try {
        if (req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only administrators can view escalated notifications'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const resolved = req.query.resolved === 'true';

        const query = `
          SELECT 
            fe.*,
            n.title,
            n.type,
            n.user_id,
            n.priority,
            n.created_at as notification_created_at
          FROM failure_escalations fe
          JOIN notifications n ON fe.notification_id = n.id
          WHERE ($3::boolean IS NULL OR (fe.resolved_at IS NOT NULL) = $3)
          ORDER BY fe.escalated_at DESC
          LIMIT $1 OFFSET $2
        `;

        const result = await db.query(query, [limit, offset, resolved || null]);
        const escalations = result.rows;

        res.json({
          success: true,
          data: {
            escalations,
            count: escalations.length,
            hasMore: escalations.length === limit
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting escalated notifications:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get escalated notifications'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Resolve escalated notification
   * PUT /api/failure-handling/escalations/:id/resolve
   */
  router.put('/escalations/:id/resolve',
    authMiddleware,
    validateRequest(Joi.object({
      resolutionNotes: Joi.string().max(1000).required()
    })),
    async (req, res) => {
      try {
        if (req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only administrators can resolve escalated notifications'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const escalationId = req.params.id;
        const { resolutionNotes } = req.body;

        const query = `
          UPDATE failure_escalations
          SET resolved_at = NOW(),
              resolution_notes = $2,
              updated_at = NOW()
          WHERE id = $1 AND resolved_at IS NULL
          RETURNING *
        `;

        const result = await db.query(query, [escalationId, resolutionNotes]);

        if (result.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Escalation not found or already resolved'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        res.json({
          success: true,
          data: {
            escalation: result.rows[0],
            message: 'Escalation resolved successfully'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error resolving escalation:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to resolve escalation'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Clean up old failure records
   * DELETE /api/failure-handling/cleanup
   */
  router.delete('/cleanup',
    authMiddleware,
    async (req, res) => {
      try {
        if (req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only administrators can clean up failure records'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const olderThanDays = parseInt(req.query.days as string) || 30;
        const deletedCount = await failureHandlingService.cleanupFailureRecords(olderThanDays);

        res.json({
          success: true,
          data: {
            deletedCount,
            olderThanDays,
            message: 'Failure records cleaned up successfully'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error cleaning up failure records:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to clean up failure records'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  return router;
}