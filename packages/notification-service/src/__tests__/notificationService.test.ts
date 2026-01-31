import { Pool } from 'pg';
import Redis from 'ioredis';
import { NotificationService } from '../services/notificationService';
import { NotificationData, NotificationPriority } from '@mentor-platform/shared';

// Mock dependencies
jest.mock('pg');
jest.mock('ioredis');
jest.mock('../services/emailService');
jest.mock('../services/smsService');
jest.mock('../services/inAppService');

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    } as any;

    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
    } as any;

    notificationService = new NotificationService(mockDb, mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendNotification', () => {
    it('should send notification successfully', async () => {
      const userId = 'test-user-id';
      const notificationData: NotificationData = {
        type: 'SESSION_REMINDER',
        title: 'Test Notification',
        message: 'This is a test notification',
        channels: ['EMAIL', 'IN_APP'],
        priority: 'MEDIUM' as NotificationPriority,
        metadata: { sessionId: 'test-session-id' }
      };

      // Mock user preferences
      mockRedis.get.mockResolvedValue(JSON.stringify({
        userId,
        channels: {
          SESSION_REMINDER: ['EMAIL', 'IN_APP']
        },
        quietHours: {
          enabled: false,
          startTime: '22:00',
          endTime: '08:00',
          timezone: 'UTC'
        }
      }));

      // Mock database operations
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const notificationId = await notificationService.sendNotification(userId, notificationData);

      expect(notificationId).toBeDefined();
      expect(typeof notificationId).toBe('string');
      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should handle quiet hours correctly', async () => {
      const userId = 'test-user-id';
      const notificationData: NotificationData = {
        type: 'SESSION_REMINDER',
        title: 'Test Notification',
        message: 'This is a test notification',
        channels: ['EMAIL', 'IN_APP'],
        priority: 'MEDIUM' as NotificationPriority
      };

      // Mock user preferences with quiet hours enabled
      mockRedis.get.mockResolvedValue(JSON.stringify({
        userId,
        channels: {
          SESSION_REMINDER: ['EMAIL', 'IN_APP']
        },
        quietHours: {
          enabled: true,
          startTime: '22:00',
          endTime: '08:00',
          timezone: 'UTC'
        }
      }));

      // Mock current time to be within quiet hours
      const originalDate = Date;
      const mockDate = new Date('2023-01-01T23:00:00Z');
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = jest.fn(() => mockDate.getTime());

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const notificationId = await notificationService.sendNotification(userId, notificationData);

      expect(notificationId).toBeDefined();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([
          expect.any(String), // notification ID
          userId,
          'SESSION_REMINDER',
          'Test Notification',
          'This is a test notification',
          expect.any(String), // channels JSON
          'MEDIUM',
          expect.any(String), // metadata JSON
          'PENDING',
          0, // attempts
          2, // max attempts for MEDIUM priority
          expect.any(Date), // scheduled_at
          expect.any(Date), // created_at
          expect.any(Date)  // updated_at
        ])
      );

      // Restore original Date
      global.Date = originalDate;
    });

    it('should filter channels based on user preferences', async () => {
      const userId = 'test-user-id';
      const notificationData: NotificationData = {
        type: 'SESSION_REMINDER',
        title: 'Test Notification',
        message: 'This is a test notification',
        channels: ['EMAIL', 'IN_APP', 'SMS'], // Request all channels
        priority: 'MEDIUM' as NotificationPriority
      };

      // Mock user preferences that only allow EMAIL and IN_APP
      mockRedis.get.mockResolvedValue(JSON.stringify({
        userId,
        channels: {
          SESSION_REMINDER: ['EMAIL', 'IN_APP'] // User doesn't want SMS
        },
        quietHours: {
          enabled: false,
          startTime: '22:00',
          endTime: '08:00',
          timezone: 'UTC'
        }
      }));

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      await notificationService.sendNotification(userId, notificationData);

      // Verify that only EMAIL and IN_APP channels are used
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([
          expect.any(String),
          userId,
          'SESSION_REMINDER',
          'Test Notification',
          'This is a test notification',
          JSON.stringify(['EMAIL', 'IN_APP']), // Should not include SMS
          'MEDIUM',
          expect.any(String),
          'PENDING',
          0,
          2,
          expect.any(Date),
          expect.any(Date),
          expect.any(Date)
        ])
      );
    });
  });

  describe('sendBulkNotifications', () => {
    it('should send multiple notifications in batches', async () => {
      const notifications = Array.from({ length: 150 }, (_, i) => ({
        userId: `user-${i}`,
        notification: {
          type: 'SYSTEM_ALERT' as const,
          title: `Notification ${i}`,
          message: `Message ${i}`,
          channels: ['EMAIL', 'IN_APP'] as const,
          priority: 'LOW' as NotificationPriority
        }
      }));

      // Mock user preferences for all users
      mockRedis.get.mockResolvedValue(JSON.stringify({
        userId: 'any-user',
        channels: {
          SYSTEM_ALERT: ['EMAIL', 'IN_APP']
        },
        quietHours: {
          enabled: false,
          startTime: '22:00',
          endTime: '08:00',
          timezone: 'UTC'
        }
      }));

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const notificationIds = await notificationService.sendBulkNotifications(notifications);

      expect(notificationIds).toHaveLength(150);
      expect(mockDb.query).toHaveBeenCalledTimes(150); // One call per notification
    });
  });

  describe('updatePreferences', () => {
    it('should update user notification preferences', async () => {
      const userId = 'test-user-id';
      const preferences = {
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
          timezone: 'America/New_York'
        }
      };

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      await notificationService.updatePreferences(userId, preferences);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notification_preferences'),
        [
          userId,
          JSON.stringify(preferences.channels),
          JSON.stringify(preferences.quietHours)
        ]
      );

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `notification_preferences:${userId}`,
        3600,
        JSON.stringify(preferences)
      );
    });
  });

  describe('getNotificationHistory', () => {
    it('should retrieve notification history for user', async () => {
      const userId = 'test-user-id';
      const mockNotifications = [
        {
          id: 'notification-1',
          user_id: userId,
          type: 'SESSION_REMINDER',
          title: 'Session Reminder',
          message: 'Your session starts soon',
          channels: ['EMAIL', 'IN_APP'],
          priority: 'HIGH',
          metadata: {},
          status: 'SENT',
          attempts: 1,
          max_attempts: 3,
          scheduled_at: new Date(),
          sent_at: new Date(),
          failure_reason: null,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockDb.query.mockResolvedValue({ rows: mockNotifications } as any);

      const result = await notificationService.getNotificationHistory(userId, 50, 0);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('notification-1');
      expect(result[0].userId).toBe(userId);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM notifications'),
        [userId, 50, 0]
      );
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const userId = 'test-user-id';
      const notificationId = 'notification-id';

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      await notificationService.markAsRead(userId, notificationId);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notifications'),
        [notificationId, userId, expect.any(String)]
      );
    });
  });
});