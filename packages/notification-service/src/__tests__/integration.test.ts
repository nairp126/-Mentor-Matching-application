import request from 'supertest';
import { Pool } from 'pg';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import app from '../index';

// Mock external dependencies
jest.mock('nodemailer');
jest.mock('twilio');

describe('Notification Service Integration Tests', () => {
  let authToken: string;
  let adminToken: string;

  beforeAll(() => {
    // Create test JWT tokens
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    
    authToken = jwt.sign(
      { id: 'test-user-id', email: 'test@example.com', role: 'STUDENT' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      { id: 'admin-user-id', email: 'admin@example.com', role: 'ADMIN' },
      jwtSecret,
      { expiresIn: '1h' }
    );
  });

  describe('POST /api/notifications/send', () => {
    it('should send a notification successfully', async () => {
      const notificationData = {
        userId: 'test-user-id',
        notification: {
          type: 'SESSION_REMINDER',
          title: 'Test Session Reminder',
          message: 'Your session starts in 15 minutes',
          channels: ['EMAIL', 'IN_APP'],
          priority: 'HIGH',
          metadata: {
            sessionId: 'test-session-id',
            scheduledAt: new Date().toISOString()
          }
        }
      };

      const response = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send(notificationData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notificationId).toBeDefined();
    });

    it('should reject invalid notification data', async () => {
      const invalidData = {
        userId: 'test-user-id',
        notification: {
          type: 'INVALID_TYPE',
          title: '',
          message: 'Test message',
          channels: [],
          priority: 'HIGH'
        }
      };

      const response = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject unauthorized requests', async () => {
      const notificationData = {
        userId: 'other-user-id', // Different from token user
        notification: {
          type: 'SESSION_REMINDER',
          title: 'Test Session Reminder',
          message: 'Your session starts in 15 minutes',
          channels: ['EMAIL', 'IN_APP'],
          priority: 'HIGH'
        }
      };

      const response = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send(notificationData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/notifications/bulk', () => {
    it('should send bulk notifications as admin', async () => {
      const bulkData = {
        notifications: [
          {
            userId: 'user-1',
            notification: {
              type: 'SYSTEM_ALERT',
              title: 'System Maintenance',
              message: 'Scheduled maintenance tonight',
              channels: ['EMAIL', 'IN_APP'],
              priority: 'MEDIUM'
            }
          },
          {
            userId: 'user-2',
            notification: {
              type: 'SYSTEM_ALERT',
              title: 'System Maintenance',
              message: 'Scheduled maintenance tonight',
              channels: ['EMAIL', 'IN_APP'],
              priority: 'MEDIUM'
            }
          }
        ]
      };

      const response = await request(app)
        .post('/api/notifications/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(bulkData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notificationIds).toHaveLength(2);
      expect(response.body.data.count).toBe(2);
    });

    it('should reject bulk notifications from non-admin', async () => {
      const bulkData = {
        notifications: [
          {
            userId: 'user-1',
            notification: {
              type: 'SYSTEM_ALERT',
              title: 'System Maintenance',
              message: 'Scheduled maintenance tonight',
              channels: ['EMAIL', 'IN_APP'],
              priority: 'MEDIUM'
            }
          }
        ]
      };

      const response = await request(app)
        .post('/api/notifications/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bulkData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/notifications/history', () => {
    it('should get notification history for authenticated user', async () => {
      const response = await request(app)
        .get('/api/notifications/history')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 10, offset: 0 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notifications).toBeDefined();
      expect(Array.isArray(response.body.data.notifications)).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api/notifications/history')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/notifications/in-app', () => {
    it('should get in-app notifications for authenticated user', async () => {
      const response = await request(app)
        .get('/api/notifications/in-app')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notifications).toBeDefined();
      expect(response.body.data.unreadCount).toBeDefined();
      expect(typeof response.body.data.unreadCount).toBe('number');
    });
  });

  describe('PUT /api/notifications/:id/read', () => {
    it('should mark notification as read', async () => {
      const notificationId = 'test-notification-id';

      const response = await request(app)
        .put(`/api/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Notification marked as read');
    });
  });

  describe('PUT /api/notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      const response = await request(app)
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('All notifications marked as read');
    });
  });

  describe('PUT /api/notifications/preferences', () => {
    it('should update notification preferences', async () => {
      const preferences = {
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

      const response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send(preferences)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Preferences updated successfully');
    });

    it('should reject invalid preferences', async () => {
      const invalidPreferences = {
        channels: {
          INVALID_TYPE: ['EMAIL']
        },
        quietHours: {
          enabled: true,
          startTime: 'invalid-time',
          endTime: '08:00',
          timezone: 'America/New_York'
        }
      };

      const response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidPreferences)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/notifications/schedule-reminder', () => {
    it('should schedule session reminder as mentor', async () => {
      const mentorToken = jwt.sign(
        { id: 'mentor-user-id', email: 'mentor@example.com', role: 'MENTOR' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
      );

      const reminderData = {
        sessionId: 'test-session-id',
        userId: 'student-user-id',
        reminderTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
        sessionData: {
          title: 'JavaScript Fundamentals',
          scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
          duration: 60,
          mentorName: 'John Doe',
          meetingLink: 'https://meet.example.com/session-123'
        }
      };

      const response = await request(app)
        .post('/api/notifications/schedule-reminder')
        .set('Authorization', `Bearer ${mentorToken}`)
        .send(reminderData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.scheduledId).toBeDefined();
    });

    it('should reject scheduling from non-mentor', async () => {
      const reminderData = {
        sessionId: 'test-session-id',
        userId: 'student-user-id',
        reminderTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        sessionData: {
          title: 'JavaScript Fundamentals',
          scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          duration: 60,
          mentorName: 'John Doe'
        }
      };

      const response = await request(app)
        .post('/api/notifications/schedule-reminder')
        .set('Authorization', `Bearer ${authToken}`) // Student token
        .send(reminderData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/notifications/stats', () => {
    it('should get notification stats as admin', async () => {
      const response = await request(app)
        .get('/api/notifications/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pendingScheduled).toBeDefined();
      expect(response.body.data.failedNotifications).toBeDefined();
      expect(response.body.data.sentToday).toBeDefined();
    });

    it('should reject stats request from non-admin', async () => {
      const response = await request(app)
        .get('/api/notifications/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.service).toBe('notification-service');
      expect(response.body.data.status).toBe('healthy');
    });
  });
});