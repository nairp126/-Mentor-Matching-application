import { Pool } from 'pg';
import Redis from 'ioredis';
import { FailureHandlingService } from '../services/failureHandlingService';
import { NotificationService, Notification } from '../services/notificationService';

// Mock dependencies
jest.mock('pg');
jest.mock('ioredis');
jest.mock('../services/notificationService');

describe('FailureHandlingService', () => {
  let failureHandlingService: FailureHandlingService;
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<Redis>;
  let mockNotificationService: jest.Mocked<NotificationService>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    } as any;

    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
    } as any;

    mockNotificationService = {
      sendNotification: jest.fn(),
    } as any;

    failureHandlingService = new FailureHandlingService(mockDb, mockRedis, mockNotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeFailure', () => {
    it('should analyze failure and determine retry strategy', async () => {
      const mockNotification: Notification = {
        id: 'notification-123',
        userId: 'user-456',
        type: 'SESSION_REMINDER',
        title: 'Test Notification',
        message: 'Test message',
        channels: ['EMAIL'],
        priority: 'HIGH',
        metadata: {},
        status: 'FAILED',
        attempts: 1,
        maxAttempts: 4,
        scheduledAt: new Date(),
        sentAt: null,
        failureReason: 'Network timeout',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.query.mockResolvedValue({
        rows: [{
          id: mockNotification.id,
          user_id: mockNotification.userId,
          type: mockNotification.type,
          title: mockNotification.title,
          message: mockNotification.message,
          channels: mockNotification.channels,
          priority: mockNotification.priority,
          metadata: mockNotification.metadata,
          status: mockNotification.status,
          attempts: mockNotification.attempts,
          max_attempts: mockNotification.maxAttempts,
          scheduled_at: mockNotification.scheduledAt,
          sent_at: mockNotification.sentAt,
          failure_reason: mockNotification.failureReason,
          created_at: mockNotification.createdAt,
          updated_at: mockNotification.updatedAt
        }]
      } as any);

      const error = new Error('Network timeout occurred');
      const analysis = await failureHandlingService.analyzeFailure('notification-123', error);

      expect(analysis.notificationId).toBe('notification-123');
      expect(analysis.failureType).toBe('TEMPORARY');
      expect(analysis.retryable).toBe(true);
      expect(analysis.nextRetryAt).toBeInstanceOf(Date);
      expect(analysis.escalationRequired).toBe(false);
      expect(analysis.failureReason).toBe('Network timeout occurred');
    });

    it('should classify rate limit errors correctly', async () => {
      const mockNotification: Notification = {
        id: 'notification-123',
        userId: 'user-456',
        type: 'SESSION_REMINDER',
        title: 'Test Notification',
        message: 'Test message',
        channels: ['EMAIL'],
        priority: 'MEDIUM',
        metadata: {},
        status: 'FAILED',
        attempts: 1,
        maxAttempts: 3,
        scheduledAt: new Date(),
        sentAt: null,
        failureReason: 'Rate limit exceeded',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.query.mockResolvedValue({ rows: [mockNotification] } as any);

      const error = new Error('Rate limit exceeded - too many requests');
      const analysis = await failureHandlingService.analyzeFailure('notification-123', error);

      expect(analysis.failureType).toBe('RATE_LIMITED');
      expect(analysis.retryable).toBe(true);
    });

    it('should classify permanent errors correctly', async () => {
      const mockNotification: Notification = {
        id: 'notification-123',
        userId: 'user-456',
        type: 'SESSION_REMINDER',
        title: 'Test Notification',
        message: 'Test message',
        channels: ['EMAIL'],
        priority: 'LOW',
        metadata: {},
        status: 'FAILED',
        attempts: 1,
        maxAttempts: 2,
        scheduledAt: new Date(),
        sentAt: null,
        failureReason: 'Invalid email address',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.query.mockResolvedValue({ rows: [mockNotification] } as any);

      const error = new Error('Invalid email address format');
      const analysis = await failureHandlingService.analyzeFailure('notification-123', error);

      expect(analysis.failureType).toBe('PERMANENT');
      expect(analysis.retryable).toBe(false);
      expect(analysis.nextRetryAt).toBeUndefined();
    });

    it('should determine escalation for urgent notifications', async () => {
      const mockNotification: Notification = {
        id: 'notification-123',
        userId: 'user-456',
        type: 'SESSION_REMINDER',
        title: 'Test Notification',
        message: 'Test message',
        channels: ['EMAIL'],
        priority: 'URGENT',
        metadata: {},
        status: 'FAILED',
        attempts: 3,
        maxAttempts: 5,
        scheduledAt: new Date(),
        sentAt: null,
        failureReason: 'Service unavailable',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.query.mockResolvedValue({ rows: [mockNotification] } as any);

      const error = new Error('Service temporarily unavailable');
      const analysis = await failureHandlingService.analyzeFailure('notification-123', error);

      expect(analysis.escalationRequired).toBe(true);
    });
  });

  describe('processFailedNotifications', () => {
    it('should process failed notifications and return statistics', async () => {
      const mockFailedNotifications: Notification[] = [
        {
          id: 'notification-1',
          userId: 'user-1',
          type: 'SESSION_REMINDER',
          title: 'Test 1',
          message: 'Message 1',
          channels: ['EMAIL'],
          priority: 'HIGH',
          metadata: {},
          status: 'FAILED',
          attempts: 1,
          maxAttempts: 4,
          scheduledAt: new Date(),
          sentAt: null,
          failureReason: 'Temporary error',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'notification-2',
          userId: 'user-2',
          type: 'SESSION_REMINDER',
          title: 'Test 2',
          message: 'Message 2',
          channels: ['EMAIL'],
          priority: 'URGENT',
          metadata: {},
          status: 'FAILED',
          attempts: 4,
          maxAttempts: 5,
          scheduledAt: new Date(),
          sentAt: null,
          failureReason: 'Service error',
          createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
          updatedAt: new Date()
        }
      ];

      // Mock getting failed notifications
      mockDb.query
        .mockResolvedValueOnce({ rows: mockFailedNotifications } as any)
        .mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const results = await failureHandlingService.processFailedNotifications();

      expect(results.processed).toBe(2);
      expect(results.retried).toBe(1); // First notification should be retried
      expect(results.escalated).toBe(1); // Second notification should be escalated
      expect(results.abandoned).toBe(0);
    });
  });

  describe('handleRateLimit', () => {
    it('should handle rate limit and schedule retry', async () => {
      const mockNotification: Notification = {
        id: 'notification-123',
        userId: 'user-456',
        type: 'SESSION_REMINDER',
        title: 'Test Notification',
        message: 'Test message',
        channels: ['EMAIL'],
        priority: 'MEDIUM',
        metadata: {},
        status: 'FAILED',
        attempts: 1,
        maxAttempts: 3,
        scheduledAt: new Date(),
        sentAt: null,
        failureReason: 'Rate limit',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.query.mockResolvedValue({ rows: [mockNotification] } as any);

      await failureHandlingService.handleRateLimit('notification-123', 'EMAIL', 300);

      // Should store rate limit info in Redis
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'rate_limit:EMAIL',
        300,
        expect.stringContaining('notification-123')
      );

      // Should schedule retry
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notifications'),
        expect.arrayContaining(['notification-123', expect.any(Date)])
      );
    });
  });

  describe('checkCircuitBreaker', () => {
    it('should return circuit breaker status', async () => {
      const circuitData = {
        failureCount: 3,
        lastFailureAt: new Date(Date.now() - 2 * 60 * 1000).toISOString() // 2 minutes ago
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(circuitData));

      const status = await failureHandlingService.checkCircuitBreaker('email-service');

      expect(status.isOpen).toBe(false); // Not enough failures to open circuit
      expect(status.failureCount).toBe(3);
      expect(status.lastFailureAt).toBeInstanceOf(Date);
    });

    it('should detect open circuit breaker', async () => {
      const circuitData = {
        failureCount: 6, // Above threshold
        lastFailureAt: new Date(Date.now() - 2 * 60 * 1000).toISOString() // 2 minutes ago
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(circuitData));

      const status = await failureHandlingService.checkCircuitBreaker('email-service');

      expect(status.isOpen).toBe(true);
      expect(status.failureCount).toBe(6);
      expect(status.nextRetryAt).toBeInstanceOf(Date);
    });

    it('should return default status for new service', async () => {
      mockRedis.get.mockResolvedValue(null);

      const status = await failureHandlingService.checkCircuitBreaker('new-service');

      expect(status.isOpen).toBe(false);
      expect(status.failureCount).toBe(0);
      expect(status.lastFailureAt).toBeUndefined();
    });
  });

  describe('recordServiceFailure', () => {
    it('should record first failure for service', async () => {
      mockRedis.get.mockResolvedValue(null);

      await failureHandlingService.recordServiceFailure('email-service');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'circuit_breaker:email-service',
        3600,
        expect.stringContaining('"failureCount":1')
      );
    });

    it('should increment failure count for existing service', async () => {
      const existingData = {
        failureCount: 2,
        lastFailureAt: new Date(Date.now() - 60 * 1000).toISOString()
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingData));

      await failureHandlingService.recordServiceFailure('email-service');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'circuit_breaker:email-service',
        3600,
        expect.stringContaining('"failureCount":3')
      );
    });
  });

  describe('resetCircuitBreaker', () => {
    it('should reset circuit breaker for service', async () => {
      await failureHandlingService.resetCircuitBreaker('email-service');

      expect(mockRedis.del).toHaveBeenCalledWith('circuit_breaker:email-service');
    });
  });

  describe('getFailureStats', () => {
    it('should return failure statistics', async () => {
      const mockFailureData = [
        {
          total_failures: '5',
          failure_type: 'TEMPORARY',
          channels: ['EMAIL'],
          status: 'FAILED'
        },
        {
          total_failures: '2',
          failure_type: 'RATE_LIMITED',
          channels: ['SMS'],
          status: 'RETRY'
        }
      ];

      const mockEscalationData = [{ escalation_count: '1' }];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockFailureData } as any)
        .mockResolvedValueOnce({ rows: mockEscalationData } as any);

      const stats = await failureHandlingService.getFailureStats(24);

      expect(stats.totalFailures).toBe(7);
      expect(stats.failuresByType.TEMPORARY).toBe(5);
      expect(stats.failuresByType.RATE_LIMITED).toBe(2);
      expect(stats.failuresByChannel.EMAIL).toBe(5);
      expect(stats.failuresByChannel.SMS).toBe(2);
      expect(stats.retrySuccessRate).toBeCloseTo(28.57, 1); // 2/7 * 100
      expect(stats.escalationRate).toBeCloseTo(14.29, 1); // 1/7 * 100
    });
  });

  describe('cleanupFailureRecords', () => {
    it('should clean up old failure records', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 15 } as any);

      const deletedCount = await failureHandlingService.cleanupFailureRecords(30);

      expect(deletedCount).toBe(15);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM failure_escalations'),
        [expect.any(Date)]
      );
    });
  });
});