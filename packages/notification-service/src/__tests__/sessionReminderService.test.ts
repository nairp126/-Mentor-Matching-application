import { Pool } from 'pg';
import Redis from 'ioredis';
import { SessionReminderService, SessionReminderConfig } from '../services/sessionReminderService';
import { NotificationService } from '../services/notificationService';

// Mock dependencies
jest.mock('pg');
jest.mock('ioredis');
jest.mock('../services/notificationService');

describe('SessionReminderService', () => {
  let sessionReminderService: SessionReminderService;
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
      keys: jest.fn(),
      del: jest.fn(),
    } as any;

    mockNotificationService = {
      sendNotification: jest.fn(),
    } as any;

    sessionReminderService = new SessionReminderService(mockDb, mockRedis, mockNotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('scheduleSessionReminders', () => {
    it('should schedule all default reminders for a session', async () => {
      const config: SessionReminderConfig = {
        sessionId: 'session-123',
        mentorId: 'mentor-456',
        studentIds: ['student-789', 'student-101'],
        sessionTitle: 'JavaScript Fundamentals',
        scheduledAt: new Date(Date.now() + 25 * 60 * 60 * 1000), // 25 hours from now
        duration: 60,
        meetingLink: 'https://meet.example.com/session-123',
        mentorName: 'John Doe'
      };

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const scheduledIds = await sessionReminderService.scheduleSessionReminders(config);

      // Should schedule 3 reminders (24h, 1h, 15min) for 3 participants (1 mentor + 2 students)
      expect(scheduledIds).toHaveLength(9); // 3 reminders × 3 participants
      expect(mockDb.query).toHaveBeenCalledTimes(9);

      // Verify the database calls include the correct data
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scheduled_notifications'),
        expect.arrayContaining([
          expect.stringMatching(/reminder_session-123_mentor-456_\d+/),
          'mentor-456',
          'SESSION_REMINDER',
          expect.any(Date),
          expect.any(String)
        ])
      );
    });

    it('should not schedule reminders for past times', async () => {
      const config: SessionReminderConfig = {
        sessionId: 'session-123',
        mentorId: 'mentor-456',
        studentIds: ['student-789'],
        sessionTitle: 'JavaScript Fundamentals',
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now (only 15min reminder should be scheduled)
        duration: 60,
        mentorName: 'John Doe'
      };

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const scheduledIds = await sessionReminderService.scheduleSessionReminders(config);

      // Should only schedule 15-minute reminders (24h and 1h are in the past)
      expect(scheduledIds).toHaveLength(2); // 1 reminder × 2 participants
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('scheduleCustomReminder', () => {
    it('should schedule a custom reminder', async () => {
      const config: SessionReminderConfig = {
        sessionId: 'session-123',
        mentorId: 'mentor-456',
        studentIds: ['student-789'],
        sessionTitle: 'JavaScript Fundamentals',
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
        duration: 60,
        mentorName: 'John Doe'
      };

      const userId = 'student-789';
      const reminderTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
      const customMessage = 'Don\'t forget to prepare your questions!';

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const scheduledId = await sessionReminderService.scheduleCustomReminder(
        config,
        userId,
        reminderTime,
        customMessage
      );

      expect(scheduledId).toBeDefined();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scheduled_notifications'),
        expect.arrayContaining([
          expect.any(String),
          userId,
          'SESSION_REMINDER',
          reminderTime,
          expect.stringContaining(customMessage)
        ])
      );
    });
  });

  describe('cancelSessionReminders', () => {
    it('should cancel all reminders for a session', async () => {
      const sessionId = 'session-123';

      // Mock finding scheduled reminders
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { id: 'reminder-1' },
            { id: 'reminder-2' },
            { id: 'reminder-3' }
          ]
        } as any)
        .mockResolvedValue({ rows: [], rowCount: 1 } as any);

      mockRedis.keys.mockResolvedValue(['reminder_key_1', 'reminder_key_2']);

      await sessionReminderService.cancelSessionReminders(sessionId);

      // Should query for reminders and then cancel each one
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM scheduled_notifications'),
        [sessionId]
      );

      // Should cancel each reminder
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE scheduled_notifications'),
        ['reminder-1']
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE scheduled_notifications'),
        ['reminder-2']
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE scheduled_notifications'),
        ['reminder-3']
      );

      // Should clear cache
      expect(mockRedis.keys).toHaveBeenCalledWith(`*reminder*${sessionId}*`);
      expect(mockRedis.del).toHaveBeenCalledWith('reminder_key_1', 'reminder_key_2');
    });
  });

  describe('updateSessionReminders', () => {
    it('should cancel existing reminders and schedule new ones', async () => {
      const sessionId = 'session-123';
      const updatedConfig: SessionReminderConfig = {
        sessionId,
        mentorId: 'mentor-456',
        studentIds: ['student-789'],
        sessionTitle: 'Updated JavaScript Fundamentals',
        scheduledAt: new Date(Date.now() + 25 * 60 * 60 * 1000), // 25 hours from now
        duration: 90, // Updated duration
        mentorName: 'John Doe'
      };

      // Mock cancellation
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'reminder-1' }] } as any)
        .mockResolvedValue({ rows: [], rowCount: 1 } as any);

      mockRedis.keys.mockResolvedValue([]);

      const scheduledIds = await sessionReminderService.updateSessionReminders(sessionId, updatedConfig);

      expect(scheduledIds).toHaveLength(6); // 3 reminders × 2 participants
      
      // Should first cancel existing reminders
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM scheduled_notifications'),
        [sessionId]
      );

      // Then schedule new reminders
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scheduled_notifications'),
        expect.arrayContaining([
          expect.any(String),
          expect.any(String),
          'SESSION_REMINDER',
          expect.any(Date),
          expect.stringContaining('Updated JavaScript Fundamentals')
        ])
      );
    });
  });

  describe('getSessionReminderStats', () => {
    it('should return reminder statistics for a session', async () => {
      const sessionId = 'session-123';

      mockDb.query.mockResolvedValue({
        rows: [
          { status: 'PENDING', count: '3' },
          { status: 'SENT', count: '2' },
          { status: 'FAILED', count: '1' }
        ]
      } as any);

      const stats = await sessionReminderService.getSessionReminderStats(sessionId);

      expect(stats).toEqual({
        scheduled: 3,
        sent: 2,
        failed: 1,
        cancelled: 0
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT status, COUNT(*) as count'),
        [sessionId]
      );
    });
  });

  describe('sendNoShowReminder', () => {
    it('should send a no-show follow-up reminder', async () => {
      const sessionId = 'session-123';
      const userId = 'student-789';

      mockDb.query.mockResolvedValue({
        rows: [{
          title: 'JavaScript Fundamentals',
          scheduled_at: new Date(),
          first_name: 'John',
          last_name: 'Doe'
        }]
      } as any);

      await sessionReminderService.sendNoShowReminder(sessionId, userId);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT s.title, s.scheduled_at'),
        [sessionId]
      );

      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          type: 'SESSION_REMINDER',
          title: 'Missed Session Follow-up',
          message: expect.stringContaining('We noticed you missed your session'),
          channels: ['EMAIL', 'IN_APP'],
          priority: 'MEDIUM',
          metadata: expect.objectContaining({
            sessionId,
            reminderType: 'no-show-followup'
          })
        })
      );
    });

    it('should handle non-existent session gracefully', async () => {
      const sessionId = 'non-existent-session';
      const userId = 'student-789';

      mockDb.query.mockResolvedValue({ rows: [] } as any);

      await sessionReminderService.sendNoShowReminder(sessionId, userId);

      expect(mockNotificationService.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('processImmediateReminders', () => {
    it('should send immediate reminders for sessions starting soon', async () => {
      const mockSessions = [{
        id: 'session-123',
        title: 'JavaScript Fundamentals',
        scheduled_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
        duration: 60,
        mentor_id: 'mentor-456',
        meeting_link: 'https://meet.example.com/session-123',
        mentor_first_name: 'John',
        mentor_last_name: 'Doe',
        student_ids: ['student-789', 'student-101']
      }];

      mockDb.query.mockResolvedValue({ rows: mockSessions } as any);
      mockRedis.get.mockResolvedValue(null); // No immediate reminder sent yet

      await sessionReminderService.processImmediateReminders();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT s.id, s.title'),
        []
      );

      // Should send immediate reminders to all participants
      expect(mockNotificationService.sendNotification).toHaveBeenCalledTimes(3); // 1 mentor + 2 students

      // Should cache that immediate reminder was sent
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'immediate_reminder_sent:session-123',
        30 * 60, // 30 minutes
        'sent'
      );
    });

    it('should not send duplicate immediate reminders', async () => {
      const mockSessions = [{
        id: 'session-123',
        title: 'JavaScript Fundamentals',
        scheduled_at: new Date(Date.now() + 10 * 60 * 1000),
        duration: 60,
        mentor_id: 'mentor-456',
        meeting_link: 'https://meet.example.com/session-123',
        mentor_first_name: 'John',
        mentor_last_name: 'Doe',
        student_ids: ['student-789']
      }];

      mockDb.query.mockResolvedValue({ rows: mockSessions } as any);
      mockRedis.get.mockResolvedValue('sent'); // Immediate reminder already sent

      await sessionReminderService.processImmediateReminders();

      expect(mockNotificationService.sendNotification).not.toHaveBeenCalled();
    });
  });
});