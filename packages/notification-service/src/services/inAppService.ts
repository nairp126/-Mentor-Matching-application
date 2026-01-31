import Redis from 'ioredis';
import { Notification } from './notificationService';

export interface InAppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  read: boolean;
  createdAt: Date;
}

export class InAppService {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Send in-app notification
   */
  async sendInAppNotification(notification: Notification): Promise<void> {
    const inAppNotification: InAppNotification = {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata,
      read: false,
      createdAt: notification.createdAt
    };

    // Store in Redis for real-time access
    const key = `in_app_notifications:${notification.userId}`;
    
    // Add to user's notification list (using sorted set for ordering)
    await this.redis.zadd(
      key,
      Date.now(), // score for ordering
      JSON.stringify(inAppNotification)
    );

    // Keep only the latest 100 notifications per user
    await this.redis.zremrangebyrank(key, 0, -101);

    // Set expiration for the key (30 days)
    await this.redis.expire(key, 30 * 24 * 60 * 60);

    // Increment unread count
    await this.redis.incr(`unread_count:${notification.userId}`);
    await this.redis.expire(`unread_count:${notification.userId}`, 30 * 24 * 60 * 60);

    // Publish to real-time channel for immediate delivery
    await this.redis.publish(
      `notifications:${notification.userId}`,
      JSON.stringify(inAppNotification)
    );
  }

  /**
   * Get in-app notifications for a user
   */
  async getInAppNotifications(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<InAppNotification[]> {
    const key = `in_app_notifications:${userId}`;
    
    // Get notifications in reverse chronological order
    const notifications = await this.redis.zrevrange(
      key,
      offset,
      offset + limit - 1
    );

    return notifications.map(notificationStr => JSON.parse(notificationStr));
  }

  /**
   * Mark notification as read
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const key = `in_app_notifications:${userId}`;
    
    // Get all notifications to find and update the specific one
    const notifications = await this.redis.zrange(key, 0, -1);
    
    for (const notificationStr of notifications) {
      const notification: InAppNotification = JSON.parse(notificationStr);
      
      if (notification.id === notificationId && !notification.read) {
        // Mark as read
        notification.read = true;
        
        // Remove old entry and add updated one
        await this.redis.zrem(key, notificationStr);
        await this.redis.zadd(
          key,
          notification.createdAt.getTime(),
          JSON.stringify(notification)
        );

        // Decrement unread count
        const unreadCount = await this.redis.decr(`unread_count:${userId}`);
        if (unreadCount < 0) {
          await this.redis.set(`unread_count:${userId}`, 0);
        }

        break;
      }
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    const key = `in_app_notifications:${userId}`;
    
    // Get all notifications
    const notifications = await this.redis.zrange(key, 0, -1);
    
    // Clear the set
    await this.redis.del(key);
    
    // Re-add all notifications as read
    const pipeline = this.redis.pipeline();
    
    for (const notificationStr of notifications) {
      const notification: InAppNotification = JSON.parse(notificationStr);
      notification.read = true;
      
      pipeline.zadd(
        key,
        notification.createdAt.getTime(),
        JSON.stringify(notification)
      );
    }
    
    await pipeline.exec();

    // Reset unread count
    await this.redis.set(`unread_count:${userId}`, 0);
    await this.redis.expire(`unread_count:${userId}`, 30 * 24 * 60 * 60);
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const count = await this.redis.get(`unread_count:${userId}`);
    return count ? parseInt(count, 10) : 0;
  }

  /**
   * Delete notification
   */
  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    const key = `in_app_notifications:${userId}`;
    
    // Get all notifications to find and remove the specific one
    const notifications = await this.redis.zrange(key, 0, -1);
    
    for (const notificationStr of notifications) {
      const notification: InAppNotification = JSON.parse(notificationStr);
      
      if (notification.id === notificationId) {
        await this.redis.zrem(key, notificationStr);
        
        // Decrement unread count if notification was unread
        if (!notification.read) {
          const unreadCount = await this.redis.decr(`unread_count:${userId}`);
          if (unreadCount < 0) {
            await this.redis.set(`unread_count:${userId}`, 0);
          }
        }
        
        break;
      }
    }
  }

  /**
   * Clear all notifications for a user
   */
  async clearAllNotifications(userId: string): Promise<void> {
    await this.redis.del(`in_app_notifications:${userId}`);
    await this.redis.set(`unread_count:${userId}`, 0);
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(userId: string): Promise<{
    total: number;
    unread: number;
    byType: Record<string, number>;
  }> {
    const notifications = await this.getInAppNotifications(userId, 1000);
    const unreadCount = await this.getUnreadCount(userId);
    
    const byType: Record<string, number> = {};
    
    for (const notification of notifications) {
      byType[notification.type] = (byType[notification.type] || 0) + 1;
    }

    return {
      total: notifications.length,
      unread: unreadCount,
      byType
    };
  }
}