import { Pool } from 'pg';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  NotificationData,
  NotificationChannel,
  NotificationPreferences,
  NotificationType,
  NotificationPriority
} from '@mentor-platform/shared';
import { EmailService } from './emailService';
import { SMSService } from './smsService';
import { InAppService } from './inAppService';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  channels: NotificationChannel[];
  priority: NotificationPriority;
  metadata?: Record<string, any>;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'RETRY';
  attempts: number;
  maxAttempts: number;
  scheduledAt?: Date;
  sentAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationDeliveryResult {
  channel: NotificationChannel;
  success: boolean;
  error?: string;
  deliveredAt?: Date;
}

export class NotificationService {
  private db: Pool;
  private redis: Redis;
  private emailService: EmailService;
  private smsService: SMSService;
  private inAppService: InAppService;

  constructor(db: Pool, redis: Redis) {
    this.db = db;
    this.redis = redis;
    this.emailService = new EmailService();
    this.smsService = new SMSService();
    this.inAppService = new InAppService(redis);
  }

  /**
   * Send a notification to a user through their preferred channels
   */
  async sendNotification(userId: string, notificationData: NotificationData): Promise<string> {
    const notificationId = uuidv4();
    
    // Get user preferences to determine actual channels to use
    const preferences = await this.getUserPreferences(userId);
    const effectiveChannels = this.determineEffectiveChannels(
      notificationData.type,
      notificationData.channels,
      preferences
    );

    // Create notification record
    const notification: Notification = {
      id: notificationId,
      userId,
      type: notificationData.type,
      title: notificationData.title,
      message: notificationData.message,
      channels: effectiveChannels,
      priority: notificationData.priority,
      metadata: notificationData.metadata,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: this.getMaxAttempts(notificationData.priority),
      scheduledAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Store notification in database
    await this.storeNotification(notification);

    // Check quiet hours before sending
    if (this.isInQuietHours(preferences)) {
      // Schedule for later delivery
      await this.scheduleNotification(notification);
      return notificationId;
    }

    // Send immediately
    await this.deliverNotification(notification);
    
    return notificationId;
  }

  /**
   * Send bulk notifications efficiently
   */
  async sendBulkNotifications(notifications: Array<{
    userId: string;
    notification: NotificationData;
  }>): Promise<string[]> {
    const notificationIds: string[] = [];
    
    // Process in batches to avoid overwhelming the system
    const batchSize = 100;
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      const batchPromises = batch.map(({ userId, notification }) =>
        this.sendNotification(userId, notification)
      );
      
      const batchIds = await Promise.all(batchPromises);
      notificationIds.push(...batchIds);
    }

    return notificationIds;
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(userId: string, preferences: NotificationPreferences): Promise<void> {
    const query = `
      INSERT INTO notification_preferences (user_id, channels, quiet_hours, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        channels = $2,
        quiet_hours = $3,
        updated_at = NOW()
    `;

    await this.db.query(query, [
      userId,
      JSON.stringify(preferences.channels),
      JSON.stringify(preferences.quietHours)
    ]);

    // Cache preferences for quick access
    await this.redis.setex(
      `notification_preferences:${userId}`,
      3600, // 1 hour cache
      JSON.stringify(preferences)
    );
  }

  /**
   * Get notification history for a user
   */
  async getNotificationHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Notification[]> {
    const query = `
      SELECT * FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.db.query(query, [userId, limit, offset]);
    return result.rows.map(this.mapRowToNotification);
  }

  /**
   * Mark notification as read
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const query = `
      UPDATE notifications
      SET metadata = COALESCE(metadata, '{}') || '{"readAt": $3}'::jsonb,
          updated_at = NOW()
      WHERE id = $1 AND user_id = $2
    `;

    await this.db.query(query, [notificationId, userId, new Date().toISOString()]);

    // Update in-app notification status
    await this.inAppService.markAsRead(userId, notificationId);
  }

  /**
   * Retry failed notifications
   */
  async retryFailedNotifications(): Promise<void> {
    const query = `
      SELECT * FROM notifications
      WHERE status = 'FAILED'
        AND attempts < max_attempts
        AND (scheduled_at IS NULL OR scheduled_at <= NOW())
      ORDER BY priority DESC, created_at ASC
      LIMIT 100
    `;

    const result = await this.db.query(query);
    const notifications = result.rows.map(this.mapRowToNotification);

    for (const notification of notifications) {
      await this.deliverNotification(notification);
    }
  }

  /**
   * Process scheduled notifications
   */
  async processScheduledNotifications(): Promise<void> {
    const query = `
      SELECT * FROM notifications
      WHERE status = 'PENDING'
        AND scheduled_at <= NOW()
      ORDER BY priority DESC, scheduled_at ASC
      LIMIT 100
    `;

    const result = await this.db.query(query);
    const notifications = result.rows.map(this.mapRowToNotification);

    for (const notification of notifications) {
      await this.deliverNotification(notification);
    }
  }

  /**
   * Deliver notification through all specified channels
   */
  private async deliverNotification(notification: Notification): Promise<void> {
    const deliveryResults: NotificationDeliveryResult[] = [];
    
    // Update status to indicate delivery attempt
    await this.updateNotificationStatus(notification.id, 'RETRY', notification.attempts + 1);

    // Attempt delivery through each channel
    for (const channel of notification.channels) {
      try {
        const result = await this.deliverThroughChannel(notification, channel);
        deliveryResults.push(result);
      } catch (error) {
        deliveryResults.push({
          channel,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Determine overall success
    const hasSuccessfulDelivery = deliveryResults.some(result => result.success);
    const allFailed = deliveryResults.every(result => !result.success);

    if (hasSuccessfulDelivery) {
      await this.updateNotificationStatus(notification.id, 'SENT');
    } else if (allFailed && notification.attempts >= notification.maxAttempts) {
      await this.updateNotificationStatus(
        notification.id,
        'FAILED',
        notification.attempts,
        deliveryResults.map(r => r.error).join('; ')
      );
    } else {
      // Schedule retry with exponential backoff
      const retryDelay = Math.min(300000, Math.pow(2, notification.attempts) * 1000); // Max 5 minutes
      const retryAt = new Date(Date.now() + retryDelay);
      await this.scheduleNotificationRetry(notification.id, retryAt);
    }
  }

  /**
   * Deliver notification through a specific channel
   */
  private async deliverThroughChannel(
    notification: Notification,
    channel: NotificationChannel
  ): Promise<NotificationDeliveryResult> {
    const startTime = Date.now();

    try {
      switch (channel) {
        case 'EMAIL':
          await this.emailService.sendEmail(notification);
          break;
        case 'SMS':
          await this.smsService.sendSMS(notification);
          break;
        case 'IN_APP':
          await this.inAppService.sendInAppNotification(notification);
          break;
        case 'PUSH':
          // TODO: Implement push notifications
          throw new Error('Push notifications not yet implemented');
        default:
          throw new Error(`Unsupported channel: ${channel}`);
      }

      return {
        channel,
        success: true,
        deliveredAt: new Date()
      };
    } catch (error) {
      return {
        channel,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get user notification preferences
   */
  private async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    // Try cache first
    const cached = await this.redis.get(`notification_preferences:${userId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const query = `
      SELECT channels, quiet_hours FROM notification_preferences
      WHERE user_id = $1
    `;

    const result = await this.db.query(query, [userId]);
    
    if (result.rows.length === 0) {
      // Return default preferences
      return this.getDefaultPreferences(userId);
    }

    const preferences: NotificationPreferences = {
      userId,
      channels: result.rows[0].channels,
      quietHours: result.rows[0].quiet_hours
    };

    // Cache for future use
    await this.redis.setex(
      `notification_preferences:${userId}`,
      3600,
      JSON.stringify(preferences)
    );

    return preferences;
  }

  /**
   * Determine effective channels based on user preferences
   */
  private determineEffectiveChannels(
    type: NotificationType,
    requestedChannels: NotificationChannel[],
    preferences: NotificationPreferences
  ): NotificationChannel[] {
    const userPreferredChannels = preferences.channels[type] || [];
    
    // Intersection of requested and user-preferred channels
    return requestedChannels.filter(channel => 
      userPreferredChannels.includes(channel)
    );
  }

  /**
   * Check if current time is within user's quiet hours
   */
  private isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quietHours.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', {
      hour12: false,
      timeZone: preferences.quietHours.timezone
    });

    const startTime = preferences.quietHours.startTime;
    const endTime = preferences.quietHours.endTime;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime <= endTime;
    }

    return currentTime >= startTime && currentTime <= endTime;
  }

  /**
   * Get maximum retry attempts based on priority
   */
  private getMaxAttempts(priority: NotificationPriority): number {
    switch (priority) {
      case 'URGENT': return 5;
      case 'HIGH': return 3;
      case 'MEDIUM': return 2;
      case 'LOW': return 1;
      default: return 2;
    }
  }

  /**
   * Get default notification preferences for a user
   */
  private getDefaultPreferences(userId: string): NotificationPreferences {
    return {
      userId,
      channels: {
        SESSION_REMINDER: ['EMAIL', 'IN_APP'],
        SESSION_CANCELLED: ['EMAIL', 'IN_APP', 'SMS'],
        NEW_MESSAGE: ['IN_APP'],
        REGISTRATION_CONFIRMED: ['EMAIL', 'IN_APP'],
        WAITLIST_PROMOTED: ['EMAIL', 'IN_APP', 'SMS'],
        REVIEW_REQUEST: ['EMAIL', 'IN_APP'],
        SYSTEM_ALERT: ['EMAIL', 'IN_APP']
      },
      quietHours: {
        enabled: true,
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'UTC'
      }
    };
  }

  /**
   * Store notification in database
   */
  private async storeNotification(notification: Notification): Promise<void> {
    const query = `
      INSERT INTO notifications (
        id, user_id, type, title, message, channels, priority,
        metadata, status, attempts, max_attempts, scheduled_at,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `;

    await this.db.query(query, [
      notification.id,
      notification.userId,
      notification.type,
      notification.title,
      notification.message,
      JSON.stringify(notification.channels),
      notification.priority,
      JSON.stringify(notification.metadata || {}),
      notification.status,
      notification.attempts,
      notification.maxAttempts,
      notification.scheduledAt,
      notification.createdAt,
      notification.updatedAt
    ]);
  }

  /**
   * Update notification status
   */
  private async updateNotificationStatus(
    notificationId: string,
    status: Notification['status'],
    attempts?: number,
    failureReason?: string
  ): Promise<void> {
    const query = `
      UPDATE notifications
      SET status = $2,
          attempts = COALESCE($3, attempts),
          failure_reason = $4,
          sent_at = CASE WHEN $2 = 'SENT' THEN NOW() ELSE sent_at END,
          updated_at = NOW()
      WHERE id = $1
    `;

    await this.db.query(query, [notificationId, status, attempts, failureReason]);
  }

  /**
   * Schedule notification for later delivery
   */
  private async scheduleNotification(notification: Notification): Promise<void> {
    // Calculate next delivery time (after quiet hours)
    const preferences = await this.getUserPreferences(notification.userId);
    const nextDeliveryTime = this.calculateNextDeliveryTime(preferences);

    const query = `
      UPDATE notifications
      SET scheduled_at = $2, updated_at = NOW()
      WHERE id = $1
    `;

    await this.db.query(query, [notification.id, nextDeliveryTime]);
  }

  /**
   * Schedule notification retry
   */
  private async scheduleNotificationRetry(notificationId: string, retryAt: Date): Promise<void> {
    const query = `
      UPDATE notifications
      SET scheduled_at = $2, status = 'PENDING', updated_at = NOW()
      WHERE id = $1
    `;

    await this.db.query(query, [notificationId, retryAt]);
  }

  /**
   * Calculate next delivery time after quiet hours
   */
  private calculateNextDeliveryTime(preferences: NotificationPreferences): Date {
    if (!preferences.quietHours.enabled) {
      return new Date();
    }

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Set to end of quiet hours tomorrow
    const [endHour, endMinute] = preferences.quietHours.endTime.split(':').map(Number);
    tomorrow.setHours(endHour, endMinute, 0, 0);

    return tomorrow;
  }

  /**
   * Map database row to Notification object
   */
  private mapRowToNotification(row: any): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      message: row.message,
      channels: row.channels,
      priority: row.priority,
      metadata: row.metadata,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at,
      failureReason: row.failure_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}