import { Router, Response } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import Joi from 'joi';
import { SessionReminderService } from '../services/sessionReminderService';
import { authMiddleware, AuthenticatedRequest } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validation';
import { ApiResponse } from '@mentor-platform/shared';
import '../types/express';

export function createSessionReminderRoutes(
  db: Pool,
  redis: Redis,
  sessionReminderService: SessionReminderService
): Router {
  const router = Router();

  // Validation schemas
  const scheduleRemindersSchema = Joi.object({
    sessionId: Joi.string().uuid().required(),
    mentorId: Joi.string().uuid().required(),
    studentIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
    sessionTitle: Joi.string().min(1).max(200).required(),
    scheduledAt: Joi.date().iso().required(),
    duration: Joi.number().integer().min(1).required(),
    meetingLink: Joi.string().uri().optional(),
    mentorName: Joi.string().min(1).max(200).required()
  });

  const customReminderSchema = Joi.object({
    sessionId: Joi.string().uuid().required(),
    mentorId: Joi.string().uuid().required(),
    studentIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
    sessionTitle: Joi.string().min(1).max(200).required(),
    scheduledAt: Joi.date().iso().required(),
    duration: Joi.number().integer().min(1).required(),
    meetingLink: Joi.string().uri().optional(),
    mentorName: Joi.string().min(1).max(200).required(),
    userId: Joi.string().uuid().required(),
    reminderTime: Joi.date().iso().required(),
    customMessage: Joi.string().max(500).optional()
  });

  /**
   * Schedule all default reminders for a session
   * POST /api/session-reminders/schedule
   */
  router.post('/schedule',
    authMiddleware,
    validateRequest(scheduleRemindersSchema),
    async (req, res) => {
      try {
        // Only mentors and admins can schedule session reminders
        if (req.user?.role !== 'MENTOR' && req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only mentors can schedule session reminders'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        // If user is a mentor, ensure they can only schedule for their own sessions
        if (req.user.role === 'MENTOR' && req.user.id !== req.body.mentorId) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You can only schedule reminders for your own sessions'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const config = req.body;
        const scheduledIds = await sessionReminderService.scheduleSessionReminders(config);

        res.json({
          success: true,
          data: {
            scheduledIds,
            count: scheduledIds.length,
            message: 'Session reminders scheduled successfully'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error scheduling session reminders:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to schedule session reminders'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Schedule a custom reminder for a session
   * POST /api/session-reminders/custom
   */
  router.post('/custom',
    authMiddleware,
    validateRequest(customReminderSchema),
    async (req, res) => {
      try {
        // Only mentors and admins can schedule custom reminders
        if (req.user?.role !== 'MENTOR' && req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only mentors can schedule custom reminders'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        // If user is a mentor, ensure they can only schedule for their own sessions
        if (req.user.role === 'MENTOR' && req.user.id !== req.body.mentorId) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You can only schedule reminders for your own sessions'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const { userId, reminderTime, customMessage, ...config } = req.body;

        const scheduledId = await sessionReminderService.scheduleCustomReminder(
          config,
          userId,
          new Date(reminderTime),
          customMessage
        );

        res.json({
          success: true,
          data: {
            scheduledId,
            message: 'Custom reminder scheduled successfully'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error scheduling custom reminder:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to schedule custom reminder'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Cancel all reminders for a session
   * DELETE /api/session-reminders/:sessionId
   */
  router.delete('/:sessionId',
    authMiddleware,
    async (req, res) => {
      try {
        const sessionId = req.params.sessionId;

        // Verify the user has permission to cancel reminders for this session
        if (req.user?.role !== 'ADMIN') {
          // Check if user is the mentor for this session
          const sessionQuery = `
            SELECT mentor_id FROM sessions WHERE id = $1
          `;
          const sessionResult = await db.query(sessionQuery, [sessionId]);

          if (sessionResult.rows.length === 0) {
            return res.status(404).json({
              success: false,
              error: {
                code: 'NOT_FOUND',
                message: 'Session not found'
              },
              timestamp: new Date().toISOString()
            } as ApiResponse);
          }

          if (sessionResult.rows[0].mentor_id !== req.user!.id) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'You can only cancel reminders for your own sessions'
              },
              timestamp: new Date().toISOString()
            } as ApiResponse);
          }
        }

        await sessionReminderService.cancelSessionReminders(sessionId);

        res.json({
          success: true,
          data: { message: 'Session reminders cancelled successfully' },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error cancelling session reminders:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to cancel session reminders'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Update reminders when session details change
   * PUT /api/session-reminders/:sessionId
   */
  router.put('/:sessionId',
    authMiddleware,
    validateRequest(scheduleRemindersSchema),
    async (req, res) => {
      try {
        const sessionId = req.params.sessionId;

        // Only mentors and admins can update session reminders
        if (req.user?.role !== 'MENTOR' && req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only mentors can update session reminders'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        // If user is a mentor, ensure they can only update their own sessions
        if (req.user.role === 'MENTOR' && req.user.id !== req.body.mentorId) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You can only update reminders for your own sessions'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const config = { ...req.body, sessionId };
        const scheduledIds = await sessionReminderService.updateSessionReminders(sessionId, config);

        res.json({
          success: true,
          data: {
            scheduledIds,
            count: scheduledIds.length,
            message: 'Session reminders updated successfully'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error updating session reminders:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to update session reminders'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get reminder statistics for a session
   * GET /api/session-reminders/:sessionId/stats
   */
  router.get('/:sessionId/stats',
    authMiddleware,
    async (req, res) => {
      try {
        const sessionId = req.params.sessionId;

        // Verify the user has permission to view stats for this session
        if (req.user?.role !== 'ADMIN') {
          // Check if user is the mentor for this session or a registered student
          const permissionQuery = `
            SELECT 
              CASE 
                WHEN s.mentor_id = $2 THEN true
                WHEN EXISTS (
                  SELECT 1 FROM session_registrations sr 
                  WHERE sr.session_id = $1 AND sr.student_id = $2
                ) THEN true
                ELSE false
              END as has_permission
            FROM sessions s
            WHERE s.id = $1
          `;

          const permissionResult = await db.query(permissionQuery, [sessionId, req.user!.id]);

          if (permissionResult.rows.length === 0 || !permissionResult.rows[0].has_permission) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'You do not have permission to view stats for this session'
              },
              timestamp: new Date().toISOString()
            } as ApiResponse);
          }
        }

        const stats = await sessionReminderService.getSessionReminderStats(sessionId);

        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting session reminder stats:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get session reminder statistics'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Send no-show follow-up reminder
   * POST /api/session-reminders/no-show
   */
  router.post('/no-show',
    authMiddleware,
    validateRequest(Joi.object({
      sessionId: Joi.string().uuid().required(),
      userId: Joi.string().uuid().required()
    })),
    async (req, res) => {
      try {
        // Only mentors and admins can send no-show reminders
        if (req.user?.role !== 'MENTOR' && req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only mentors can send no-show reminders'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const { sessionId, userId } = req.body;

        // If user is a mentor, verify they own this session
        if (req.user.role === 'MENTOR') {
          const sessionQuery = `
            SELECT mentor_id FROM sessions WHERE id = $1
          `;
          const sessionResult = await db.query(sessionQuery, [sessionId]);

          if (sessionResult.rows.length === 0 || sessionResult.rows[0].mentor_id !== req.user.id) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'You can only send no-show reminders for your own sessions'
              },
              timestamp: new Date().toISOString()
            } as ApiResponse);
          }
        }

        await sessionReminderService.sendNoShowReminder(sessionId, userId);

        res.json({
          success: true,
          data: { message: 'No-show reminder sent successfully' },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error sending no-show reminder:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to send no-show reminder'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  return router;
}