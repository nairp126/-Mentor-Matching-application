import cron from 'node-cron';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { NotificationService } from './notificationService';
import { NotificationData, NotificationPriority } from '@mentor-platform/shared';

export interface ScheduledNotification {
  id: string;
  userId: string;
  type: string;
  scheduledAt: Date;
  data: NotificationData;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  createdAt: Date;
}

export class SchedulerService {
  private db: Pool;
  private redis: Redis;
  private notificationService: NotificationService;
  private isRunning: boolean = false;

  constructor(db: Pool, redis: Redis, notificationService: NotificationService) {
    this.db = db;
    this.redis = redis;
    this.notificationService = notificationService;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Process scheduled notifications every minute
    cron.schedule('* * * * *', async () => {
      try {
        await this.processScheduledNotifications();
      } catch (error) {
        console.error('Error processing scheduled notifications:', error);
      }
    });

    // Process session reminders every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        await this.processSessionReminders();
      } catch (error) {
        console.error('Error processing session reminders:', error);
      }
    });

    // Retry failed notifications every 10 minutes
    cron.schedule('*/10 * * * *', async () => {
      try {
        await this.notificationService.retryFailedNotifications();
      } catch (error) {
        console.error('Error retrying failed notifications:', error);
      }
    });

    // Clean up old notifications daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      try {
        await this.cleanupOldNotifications();
      } catch (error) {
        console.error('Error cleaning up old notifications:', error);
      }
    });

    console.log('Notification scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.isRunning = false;
    console.log('Notification scheduler stopped');
  }

  /**
   * Schedule a session reminder notification
   */
  async scheduleSessionReminder(
    sessionId: string,
    userId: string,
    reminderTime: Date,
    sessionData: {
      title: string;
      scheduledAt: Date;
      duration: number;
      mentorName?: string;
      meetingLink?: string;
    }
  ): Promise<string> {
    const notificationData: NotificationData = {
      type: 'SESSION_REMINDER',
      title: `Reminder: ${sessionData.title}`,
      message: `Your mentoring session is starting soon. Please be ready to join.`,
      channels: ['EMAIL', 'IN_APP', 'SMS'],
      priority: 'HIGH' as NotificationPriority,
      metadata: {
        sessionId,
        scheduledAt: sessionData.scheduledAt.toISOString(),
        duration: sessionData.duration,
        mentorName: sessionData.mentorName,
        meetingLink: sessionData.meetingLink
      }
    };

    return await this.scheduleNotification(userId, reminderTime, notificationData);
  }

  /**
   * Schedule a generic notification
   */
  async scheduleNotification(
    userId: string,
    scheduledAt: Date,
    notificationData: NotificationData
  ): Promise<string> {
    const id = `scheduled_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const query = `
      INSERT INTO scheduled_notifications (
        id, user_id, type, scheduled_at, data, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW())
    `;

    await this.db.query(query, [
      id,
      userId,
      notificationData.type,
      scheduledAt,
      JSON.stringify(notificationData)
    ]);

    return id;
  }

  /**
   * Cancel a scheduled notification
   */
  async cancelScheduledNotification(notificationId: string): Promise<void> {
    const query = `
      UPDATE scheduled_notifications
      SET status = 'CANCELLED', updated_at = NOW()
      WHERE id = $1 AND status = 'PENDING'
    `;

    await this.db.query(query, [notificationId]);
  }

  /**
   * Process scheduled notifications that are due
   */
  private async processScheduledNotifications(): Promise<void> {
    const query = `
      SELECT * FROM scheduled_notifications
      WHERE status = 'PENDING'
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      LIMIT 100
    `;

    const result = await this.db.query(query);
    const notifications = result.rows;

    for (const notification of notifications) {
      try {
        await this.notificationService.sendNotification(
          notification.user_id,
          JSON.parse(notification.data)
        );

        // Mark as sent
        await this.updateScheduledNotificationStatus(notification.id, 'SENT');
      } catch (error) {
        console.error(`Failed to send scheduled notification ${notification.id}:`, error);
        await this.updateScheduledNotificationStatus(notification.id, 'FAILED');
      }
    }
  }

  /**
   * Process session reminders
   */
  private async processSessionReminders(): Promise<void> {
    // This is now handled by SessionReminderService.processImmediateReminders()
    // Keep this method for backward compatibility but delegate to the specialized service
    console.log('Session reminders are now handled by SessionReminderService');
  }

  /**
   * Update scheduled notification status
   */
  private async updateScheduledNotificationStatus(
    notificationId: string,
    status: 'SENT' | 'FAILED' | 'CANCELLED'
  ): Promise<void> {
    const query = `
      UPDATE scheduled_notifications
      SET status = $2, updated_at = NOW()
      WHERE id = $1
    `;

    await this.db.query(query, [notificationId, status]);
  }

  /**
   * Clean up old notifications
   */
  private async cleanupOldNotifications(): Promise<void> {
    // Delete notifications older than 30 days
    const cleanupQuery = `
      DELETE FROM notifications
      WHERE created_at < NOW() - INTERVAL '30 days'
    `;

    const result = await this.db.query(cleanupQuery);
    console.log(`Cleaned up ${result.rowCount} old notifications`);

    // Delete old scheduled notifications
    const scheduledCleanupQuery = `
      DELETE FROM scheduled_notifications
      WHERE created_at < NOW() - INTERVAL '30 days'
        AND status IN ('SENT', 'FAILED', 'CANCELLED')
    `;

    const scheduledResult = await this.db.query(scheduledCleanupQuery);
    console.log(`Cleaned up ${scheduledResult.rowCount} old scheduled notifications`);
  }

  /**
   * Get scheduler statistics
   */
  async getStats(): Promise<{
    pendingScheduled: number;
    failedNotifications: number;
    sentToday: number;
  }> {
    const pendingQuery = `
      SELECT COUNT(*) as count FROM scheduled_notifications
      WHERE status = 'PENDING'
    `;

    const failedQuery = `
      SELECT COUNT(*) as count FROM notifications
      WHERE status = 'FAILED'
    `;

    const sentTodayQuery = `
      SELECT COUNT(*) as count FROM notifications
      WHERE status = 'SENT'
        AND sent_at >= CURRENT_DATE
    `;

    const [pendingResult, failedResult, sentTodayResult] = await Promise.all([
      this.db.query(pendingQuery),
      this.db.query(failedQuery),
      this.db.query(sentTodayQuery)
    ]);

    return {
      pendingScheduled: parseInt(pendingResult.rows[0].count),
      failedNotifications: parseInt(failedResult.rows[0].count),
      sentToday: parseInt(sentTodayResult.rows[0].count)
    };
  }
}