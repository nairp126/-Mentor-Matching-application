import { Pool } from 'pg';
import Redis from 'ioredis';
import { NotificationService } from './notificationService';
import { NotificationData, NotificationPriority } from '@mentor-platform/shared';

export interface SessionReminderConfig {
  sessionId: string;
  mentorId: string;
  studentIds: string[];
  sessionTitle: string;
  scheduledAt: Date;
  duration: number;
  meetingLink?: string;
  mentorName: string;
}

export interface ReminderSchedule {
  minutes: number;
  label: string;
  priority: NotificationPriority;
  channels: string[];
}

export class SessionReminderService {
  private db: Pool;
  private redis: Redis;
  private notificationService: NotificationService;

  // Default reminder schedule
  private defaultReminderSchedule: ReminderSchedule[] = [
    {
      minutes: 24 * 60, // 24 hours
      label: '24 hours',
      priority: 'MEDIUM',
      channels: ['EMAIL', 'IN_APP']
    },
    {
      minutes: 60, // 1 hour
      label: '1 hour',
      priority: 'HIGH',
      channels: ['EMAIL', 'IN_APP']
    },
    {
      minutes: 15, // 15 minutes
      label: '15 minutes',
      priority: 'HIGH',
      channels: ['EMAIL', 'IN_APP', 'SMS']
    }
  ];

  constructor(db: Pool, redis: Redis, notificationService: NotificationService) {
    this.db = db;
    this.redis = redis;
    this.notificationService = notificationService;
  }

  /**
   * Schedule all reminders for a session
   */
  async scheduleSessionReminders(config: SessionReminderConfig): Promise<string[]> {
    const scheduledIds: string[] = [];

    for (const reminder of this.defaultReminderSchedule) {
      const reminderTime = new Date(config.scheduledAt.getTime() - reminder.minutes * 60 * 1000);
      
      // Only schedule if reminder time is in the future
      if (reminderTime > new Date()) {
        // Schedule reminders for all participants (mentor + students)
        const allParticipants = [config.mentorId, ...config.studentIds];
        
        for (const userId of allParticipants) {
          const scheduledId = await this.scheduleIndividualReminder(
            config,
            userId,
            reminderTime,
            reminder
          );
          scheduledIds.push(scheduledId);
        }
      }
    }

    return scheduledIds;
  }

  /**
   * Schedule a custom reminder for a session
   */
  async scheduleCustomReminder(
    config: SessionReminderConfig,
    userId: string,
    reminderTime: Date,
    customMessage?: string
  ): Promise<string> {
    const reminder: ReminderSchedule = {
      minutes: Math.floor((config.scheduledAt.getTime() - reminderTime.getTime()) / (60 * 1000)),
      label: 'custom',
      priority: 'MEDIUM',
      channels: ['EMAIL', 'IN_APP']
    };

    return await this.scheduleIndividualReminder(config, userId, reminderTime, reminder, customMessage);
  }

  /**
   * Cancel all reminders for a session
   */
  async cancelSessionReminders(sessionId: string): Promise<void> {
    // Get all scheduled reminders for this session
    const query = `
      SELECT id FROM scheduled_notifications
      WHERE data->>'sessionId' = $1 AND status = 'PENDING'
    `;

    const result = await this.db.query(query, [sessionId]);
    const reminderIds = result.rows.map(row => row.id);

    // Cancel each reminder
    for (const reminderId of reminderIds) {
      await this.cancelReminder(reminderId);
    }

    // Also clear any cached reminder flags
    await this.clearReminderCache(sessionId);
  }

  /**
   * Update session reminders when session details change
   */
  async updateSessionReminders(
    sessionId: string,
    updatedConfig: SessionReminderConfig
  ): Promise<string[]> {
    // Cancel existing reminders
    await this.cancelSessionReminders(sessionId);

    // Schedule new reminders with updated information
    return await this.scheduleSessionReminders(updatedConfig);
  }

  /**
   * Get reminder statistics for a session
   */
  async getSessionReminderStats(sessionId: string): Promise<{
    scheduled: number;
    sent: number;
    failed: number;
    cancelled: number;
  }> {
    const query = `
      SELECT 
        status,
        COUNT(*) as count
      FROM scheduled_notifications
      WHERE data->>'sessionId' = $1
      GROUP BY status
    `;

    const result = await this.db.query(query, [sessionId]);
    
    const stats = {
      scheduled: 0,
      sent: 0,
      failed: 0,
      cancelled: 0
    };

    for (const row of result.rows) {
      switch (row.status) {
        case 'PENDING':
          stats.scheduled = parseInt(row.count);
          break;
        case 'SENT':
          stats.sent = parseInt(row.count);
          break;
        case 'FAILED':
          stats.failed = parseInt(row.count);
          break;
        case 'CANCELLED':
          stats.cancelled = parseInt(row.count);
          break;
      }
    }

    return stats;
  }

  /**
   * Process immediate session reminders (for sessions starting very soon)
   */
  async processImmediateReminders(): Promise<void> {
    // Get sessions starting within the next 30 minutes that haven't had immediate reminders sent
    const query = `
      SELECT 
        s.id,
        s.title,
        s.scheduled_at,
        s.duration,
        s.mentor_id,
        s.meeting_link,
        mp.first_name as mentor_first_name,
        mp.last_name as mentor_last_name,
        array_agg(sr.student_id) as student_ids
      FROM sessions s
      JOIN mentor_profiles mp ON s.mentor_id = mp.user_id
      JOIN session_registrations sr ON s.id = sr.session_id
      WHERE s.status = 'SCHEDULED'
        AND s.scheduled_at > NOW()
        AND s.scheduled_at <= NOW() + INTERVAL '30 minutes'
        AND sr.status = 'CONFIRMED'
      GROUP BY s.id, s.title, s.scheduled_at, s.duration, s.mentor_id, s.meeting_link, mp.first_name, mp.last_name
    `;

    const result = await this.db.query(query);
    const sessions = result.rows;

    for (const session of sessions) {
      const cacheKey = `immediate_reminder_sent:${session.id}`;
      const alreadySent = await this.redis.get(cacheKey);

      if (!alreadySent) {
        await this.sendImmediateReminder(session);
        
        // Mark as sent to prevent duplicates
        await this.redis.setex(cacheKey, 30 * 60, 'sent'); // 30 minutes cache
      }
    }
  }

  /**
   * Send follow-up reminder for no-shows
   */
  async sendNoShowReminder(sessionId: string, userId: string): Promise<void> {
    // Get session details
    const sessionQuery = `
      SELECT s.title, s.scheduled_at, mp.first_name, mp.last_name
      FROM sessions s
      JOIN mentor_profiles mp ON s.mentor_id = mp.user_id
      WHERE s.id = $1
    `;

    const sessionResult = await this.db.query(sessionQuery, [sessionId]);
    if (sessionResult.rows.length === 0) {
      return;
    }

    const session = sessionResult.rows[0];
    const mentorName = `${session.first_name} ${session.last_name}`;

    const notificationData: NotificationData = {
      type: 'SESSION_REMINDER',
      title: 'Missed Session Follow-up',
      message: `We noticed you missed your session "${session.title}" with ${mentorName}. Would you like to reschedule?`,
      channels: ['EMAIL', 'IN_APP'],
      priority: 'MEDIUM',
      metadata: {
        sessionId,
        sessionTitle: session.title,
        mentorName,
        scheduledAt: session.scheduled_at,
        reminderType: 'no-show-followup'
      }
    };

    await this.notificationService.sendNotification(userId, notificationData);
  }

  /**
   * Schedule an individual reminder
   */
  private async scheduleIndividualReminder(
    config: SessionReminderConfig,
    userId: string,
    reminderTime: Date,
    reminder: ReminderSchedule,
    customMessage?: string
  ): Promise<string> {
    const isForMentor = userId === config.mentorId;
    
    const notificationData: NotificationData = {
      type: 'SESSION_REMINDER',
      title: `Session in ${reminder.label}: ${config.sessionTitle}`,
      message: customMessage || this.generateReminderMessage(config, isForMentor, reminder.label),
      channels: reminder.channels as any[],
      priority: reminder.priority,
      metadata: {
        sessionId: config.sessionId,
        sessionTitle: config.sessionTitle,
        scheduledAt: config.scheduledAt.toISOString(),
        duration: config.duration,
        mentorName: config.mentorName,
        meetingLink: config.meetingLink,
        reminderType: reminder.label,
        isForMentor
      }
    };

    const scheduledId = `reminder_${config.sessionId}_${userId}_${reminder.minutes}`;

    // Store in scheduled_notifications table
    const query = `
      INSERT INTO scheduled_notifications (
        id, user_id, type, scheduled_at, data, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW())
      ON CONFLICT (id) DO UPDATE SET
        scheduled_at = $4,
        data = $5,
        status = 'PENDING',
        updated_at = NOW()
    `;

    await this.db.query(query, [
      scheduledId,
      userId,
      'SESSION_REMINDER',
      reminderTime,
      JSON.stringify(notificationData)
    ]);

    return scheduledId;
  }

  /**
   * Cancel a specific reminder
   */
  private async cancelReminder(reminderId: string): Promise<void> {
    const query = `
      UPDATE scheduled_notifications
      SET status = 'CANCELLED', updated_at = NOW()
      WHERE id = $1 AND status = 'PENDING'
    `;

    await this.db.query(query, [reminderId]);
  }

  /**
   * Clear reminder cache for a session
   */
  private async clearReminderCache(sessionId: string): Promise<void> {
    const keys = await this.redis.keys(`*reminder*${sessionId}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Send immediate reminder for sessions starting very soon
   */
  private async sendImmediateReminder(session: any): Promise<void> {
    const mentorName = `${session.mentor_first_name} ${session.mentor_last_name}`;
    const studentIds = session.student_ids || [];
    const allParticipants = [session.mentor_id, ...studentIds];

    for (const userId of allParticipants) {
      const isForMentor = userId === session.mentor_id;
      
      const notificationData: NotificationData = {
        type: 'SESSION_REMINDER',
        title: `Session starting now: ${session.title}`,
        message: isForMentor 
          ? `Your mentoring session is starting now. Your students are waiting for you.`
          : `Your mentoring session with ${mentorName} is starting now. Please join the session.`,
        channels: ['IN_APP', 'SMS'],
        priority: 'URGENT',
        metadata: {
          sessionId: session.id,
          sessionTitle: session.title,
          scheduledAt: session.scheduled_at,
          duration: session.duration,
          mentorName,
          meetingLink: session.meeting_link,
          reminderType: 'immediate',
          isForMentor
        }
      };

      await this.notificationService.sendNotification(userId, notificationData);
    }
  }

  /**
   * Generate reminder message based on context
   */
  private generateReminderMessage(
    config: SessionReminderConfig,
    isForMentor: boolean,
    timeLabel: string
  ): string {
    if (isForMentor) {
      const studentCount = config.studentIds.length;
      const studentText = studentCount === 1 ? 'student is' : `${studentCount} students are`;
      
      return `Your mentoring session is starting in ${timeLabel}. Your ${studentText} expecting you. Please be ready to join.`;
    } else {
      return `Your mentoring session with ${config.mentorName} is starting in ${timeLabel}. Please be ready to join.`;
    }
  }
}