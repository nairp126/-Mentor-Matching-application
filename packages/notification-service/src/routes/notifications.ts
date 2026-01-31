import { Router, Response } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import Joi from 'joi';
import { NotificationService } from '../services/notificationService';
import { InAppService } from '../services/inAppService';
import { SchedulerService } from '../services/schedulerService';
import { authMiddleware, AuthenticatedRequest } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validation';
import { ApiResponse, NotificationData, NotificationPreferences } from '@mentor-platform/shared';
import '../types/express';

export function createNotificationRoutes(
  db: Pool,
  redis: Redis,
  notificationService: NotificationService,
  inAppService: InAppService,
  schedulerService: SchedulerService
): Router {
  const router = Router();

  // Validation schemas
  const sendNotificationSchema = Joi.object({
    userId: Joi.string().uuid().required(),
    notification: Joi.object({
      type: Joi.string().valid(
        'SESSION_REMINDER',
        'SESSION_CANCELLED',
        'NEW_MESSAGE',
        'REGISTRATION_CONFIRMED',
        'WAITLIST_PROMOTED',
        'REVIEW_REQUEST',
        'SYSTEM_ALERT'
      ).required(),
      title: Joi.string().min(1).max(200).required(),
      message: Joi.string().min(1).max(1000).required(),
      channels: Joi.array().items(
        Joi.string().valid('EMAIL', 'IN_APP', 'SMS', 'PUSH')
      ).min(1).required(),
      priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT').required(),
      metadata: Joi.object().optional()
    }).required()
  });

  const bulkNotificationSchema = Joi.object({
    notifications: Joi.array().items(
      Joi.object({
        userId: Joi.string().uuid().required(),
        notification: Joi.object({
          type: Joi.string().valid(
            'SESSION_REMINDER',
            'SESSION_CANCELLED',
            'NEW_MESSAGE',
            'REGISTRATION_CONFIRMED',
            'WAITLIST_PROMOTED',
            'REVIEW_REQUEST',
            'SYSTEM_ALERT'
          ).required(),
          title: Joi.string().min(1).max(200).required(),
          message: Joi.string().min(1).max(1000).required(),
          channels: Joi.array().items(
            Joi.string().valid('EMAIL', 'IN_APP', 'SMS', 'PUSH')
          ).min(1).required(),
          priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT').required(),
          metadata: Joi.object().optional()
        }).required()
      })
    ).min(1).max(100).required()
  });

  const preferencesSchema = Joi.object({
    channels: Joi.object().pattern(
      Joi.string().valid(
        'SESSION_REMINDER',
        'SESSION_CANCELLED',
        'NEW_MESSAGE',
        'REGISTRATION_CONFIRMED',
        'WAITLIST_PROMOTED',
        'REVIEW_REQUEST',
        'SYSTEM_ALERT'
      ),
      Joi.array().items(
        Joi.string().valid('EMAIL', 'IN_APP', 'SMS', 'PUSH')
      )
    ).required(),
    quietHours: Joi.object({
      enabled: Joi.boolean().required(),
      startTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      endTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      timezone: Joi.string().required()
    }).required()
  });

  const scheduleReminderSchema = Joi.object({
    sessionId: Joi.string().uuid().required(),
    userId: Joi.string().uuid().required(),
    reminderTime: Joi.date().iso().required(),
    sessionData: Joi.object({
      title: Joi.string().required(),
      scheduledAt: Joi.date().iso().required(),
      duration: Joi.number().integer().min(1).required(),
      mentorName: Joi.string().optional(),
      meetingLink: Joi.string().uri().optional()
    }).required()
  });

  /**
   * Send a single notification
   * POST /api/notifications/send
   */
  router.post('/send',
    authMiddleware,
    validateRequest(sendNotificationSchema),
    async (req, res) => {
      try {
        const { userId, notification } = req.body;

        // Check if user has permission to send notifications to this user
        if (req.user?.role !== 'ADMIN' && req.user?.id !== userId) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You can only send notifications to yourself'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const notificationId = await notificationService.sendNotification(userId, notification);

        res.json({
          success: true,
          data: { notificationId },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to send notification'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Send bulk notifications
   * POST /api/notifications/bulk
   */
  router.post('/bulk',
    authMiddleware,
    validateRequest(bulkNotificationSchema),
    async (req, res) => {
      try {
        // Only admins can send bulk notifications
        if (req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only administrators can send bulk notifications'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const { notifications } = req.body;
        const notificationIds = await notificationService.sendBulkNotifications(notifications);

        res.json({
          success: true,
          data: { notificationIds, count: notificationIds.length },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error sending bulk notifications:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to send bulk notifications'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get notification history for current user
   * GET /api/notifications/history
   */
  router.get('/history',
    authMiddleware,
    async (req, res) => {
      try {
        const userId = req.user!.id as string;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const notifications = await notificationService.getNotificationHistory(userId, limit, offset);

        res.json({
          success: true,
          data: { notifications, count: notifications.length },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting notification history:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get notification history'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get in-app notifications for current user
   * GET /api/notifications/in-app
   */
  router.get('/in-app',
    authMiddleware,
    async (req, res) => {
      try {
        const userId = req.user!.id as string;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const notifications = await inAppService.getInAppNotifications(userId, limit, offset);
        const unreadCount = await inAppService.getUnreadCount(userId);

        res.json({
          success: true,
          data: { notifications, unreadCount },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting in-app notifications:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get in-app notifications'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Mark notification as read
   * PUT /api/notifications/:id/read
   */
  router.put('/:id/read',
    authMiddleware,
    async (req, res) => {
      try {
        const userId = req.user!.id as string;
        const notificationId = req.params.id;

        await notificationService.markAsRead(userId, notificationId);

        res.json({
          success: true,
          data: { message: 'Notification marked as read' },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to mark notification as read'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Mark all notifications as read
   * PUT /api/notifications/read-all
   */
  router.put('/read-all',
    authMiddleware,
    async (req, res) => {
      try {
        const userId = req.user!.id as string;
        await inAppService.markAllAsRead(userId);

        res.json({
          success: true,
          data: { message: 'All notifications marked as read' },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to mark all notifications as read'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Update notification preferences
   * PUT /api/notifications/preferences
   */
  router.put('/preferences',
    authMiddleware,
    validateRequest(preferencesSchema),
    async (req, res) => {
      try {
        const userId = req.user!.id as string;
        const preferences: NotificationPreferences = {
          userId,
          ...req.body
        };

        await notificationService.updatePreferences(userId, preferences);

        res.json({
          success: true,
          data: { message: 'Preferences updated successfully' },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error updating notification preferences:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to update notification preferences'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Schedule session reminder
   * POST /api/notifications/schedule-reminder
   */
  router.post('/schedule-reminder',
    authMiddleware,
    validateRequest(scheduleReminderSchema),
    async (req, res) => {
      try {
        // Only mentors and admins can schedule reminders
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

        const { sessionId, userId, reminderTime, sessionData } = req.body;

        const scheduledId = await schedulerService.scheduleSessionReminder(
          sessionId,
          userId,
          new Date(reminderTime),
          sessionData
        );

        res.json({
          success: true,
          data: { scheduledId },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error scheduling session reminder:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to schedule session reminder'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get notification statistics (admin only)
   * GET /api/notifications/stats
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
              message: 'Only administrators can view notification statistics'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const stats = await schedulerService.getStats();

        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting notification stats:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get notification statistics'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  return router;
}