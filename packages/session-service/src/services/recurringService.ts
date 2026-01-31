import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../index';
import { SessionService, SessionData } from './sessionService';

export interface RecurringPattern {
  id: string;
  mentorId: string;
  title: string;
  description: string;
  expertiseAreas: string[];
  sessionType: 'ONE_ON_ONE' | 'GROUP' | 'WORKSHOP';
  duration: number;
  capacity: number;
  meetingLink?: string;
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  dayOfWeek?: number; // 0-6, Sunday = 0
  timeOfDay: string; // HH:MM format
  startDate: Date;
  endDate?: Date;
  maxSessions?: number;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecurringPatternData {
  title: string;
  description: string;
  expertiseAreas: string[];
  sessionType: 'ONE_ON_ONE' | 'GROUP' | 'WORKSHOP';
  duration: number;
  capacity: number;
  meetingLink?: string;
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  dayOfWeek?: number;
  timeOfDay: string;
  startDate: Date;
  endDate?: Date;
  maxSessions?: number;
  timezone: string;
}

export class RecurringService {
  private sessionService: SessionService;

  constructor() {
    this.sessionService = new SessionService();
  }

  async createRecurringPattern(mentorId: string, patternData: RecurringPatternData): Promise<RecurringPattern> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      const patternId = uuidv4();
      const now = new Date();

      // Validate pattern data
      this.validateRecurringPattern(patternData);

      // Create recurring pattern
      const result = await client.query(`
        INSERT INTO recurring_patterns (
          id, mentor_id, title, description, expertise_areas, session_type,
          duration, capacity, meeting_link, frequency, day_of_week, time_of_day,
          start_date, end_date, max_sessions, timezone, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING *
      `, [
        patternId,
        mentorId,
        patternData.title,
        patternData.description,
        JSON.stringify(patternData.expertiseAreas),
        patternData.sessionType,
        patternData.duration,
        patternData.capacity,
        patternData.meetingLink || null,
        patternData.frequency,
        patternData.dayOfWeek || null,
        patternData.timeOfDay,
        patternData.startDate,
        patternData.endDate || null,
        patternData.maxSessions || null,
        patternData.timezone,
        true,
        now,
        now
      ]);

      await client.query('COMMIT');

      const pattern = result.rows[0];
      return this.mapPatternFromDb(pattern);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private validateRecurringPattern(patternData: RecurringPatternData): void {
    if (patternData.frequency === 'WEEKLY' || patternData.frequency === 'BIWEEKLY') {
      if (patternData.dayOfWeek === undefined || patternData.dayOfWeek < 0 || patternData.dayOfWeek > 6) {
        throw new Error('Day of week is required for weekly/biweekly patterns and must be 0-6');
      }
    }

    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(patternData.timeOfDay)) {
      throw new Error('Time of day must be in HH:MM format');
    }

    if (patternData.endDate && patternData.endDate <= patternData.startDate) {
      throw new Error('End date must be after start date');
    }

    if (patternData.maxSessions && patternData.maxSessions < 1) {
      throw new Error('Max sessions must be at least 1');
    }
  }

  async updateRecurringPattern(patternId: string, updates: Partial<RecurringPatternData>): Promise<RecurringPattern> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Build update query
      const updateFields = [];
      const values = [];
      let paramCount = 1;

      if (updates.title !== undefined) {
        updateFields.push(`title = $${paramCount++}`);
        values.push(updates.title);
      }
      if (updates.description !== undefined) {
        updateFields.push(`description = $${paramCount++}`);
        values.push(updates.description);
      }
      if (updates.expertiseAreas !== undefined) {
        updateFields.push(`expertise_areas = $${paramCount++}`);
        values.push(JSON.stringify(updates.expertiseAreas));
      }
      if (updates.sessionType !== undefined) {
        updateFields.push(`session_type = $${paramCount++}`);
        values.push(updates.sessionType);
      }
      if (updates.duration !== undefined) {
        updateFields.push(`duration = $${paramCount++}`);
        values.push(updates.duration);
      }
      if (updates.capacity !== undefined) {
        updateFields.push(`capacity = $${paramCount++}`);
        values.push(updates.capacity);
      }
      if (updates.meetingLink !== undefined) {
        updateFields.push(`meeting_link = $${paramCount++}`);
        values.push(updates.meetingLink);
      }
      if (updates.frequency !== undefined) {
        updateFields.push(`frequency = $${paramCount++}`);
        values.push(updates.frequency);
      }
      if (updates.dayOfWeek !== undefined) {
        updateFields.push(`day_of_week = $${paramCount++}`);
        values.push(updates.dayOfWeek);
      }
      if (updates.timeOfDay !== undefined) {
        updateFields.push(`time_of_day = $${paramCount++}`);
        values.push(updates.timeOfDay);
      }
      if (updates.endDate !== undefined) {
        updateFields.push(`end_date = $${paramCount++}`);
        values.push(updates.endDate);
      }
      if (updates.maxSessions !== undefined) {
        updateFields.push(`max_sessions = $${paramCount++}`);
        values.push(updates.maxSessions);
      }
      if (updates.timezone !== undefined) {
        updateFields.push(`timezone = $${paramCount++}`);
        values.push(updates.timezone);
      }

      if (updateFields.length === 0) {
        const pattern = await this.getRecurringPattern(patternId);
        if (!pattern) throw new Error('Pattern not found');
        return pattern;
      }

      updateFields.push(`updated_at = $${paramCount++}`);
      values.push(new Date());
      values.push(patternId);

      const result = await client.query(`
        UPDATE recurring_patterns 
        SET ${updateFields.join(', ')} 
        WHERE id = $${paramCount}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        throw new Error('Pattern not found');
      }

      await client.query('COMMIT');

      return this.mapPatternFromDb(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getRecurringPattern(patternId: string): Promise<RecurringPattern | null> {
    const client = await db.getClient();
    
    try {
      const result = await client.query(
        'SELECT * FROM recurring_patterns WHERE id = $1',
        [patternId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapPatternFromDb(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async getMentorRecurringPatterns(mentorId: string): Promise<RecurringPattern[]> {
    const client = await db.getClient();
    
    try {
      const result = await client.query(
        'SELECT * FROM recurring_patterns WHERE mentor_id = $1 ORDER BY created_at DESC',
        [mentorId]
      );

      return result.rows.map(row => this.mapPatternFromDb(row));
    } finally {
      client.release();
    }
  }

  async deactivateRecurringPattern(patternId: string): Promise<void> {
    const client = await db.getClient();
    
    try {
      await client.query(
        'UPDATE recurring_patterns SET is_active = false, updated_at = $1 WHERE id = $2',
        [new Date(), patternId]
      );
    } finally {
      client.release();
    }
  }

  async generateSessionsFromPattern(patternId: string, lookAheadDays: number = 30): Promise<string[]> {
    const client = await db.getClient();
    
    try {
      const pattern = await this.getRecurringPattern(patternId);
      if (!pattern || !pattern.isActive) {
        throw new Error('Pattern not found or inactive');
      }

      const sessionIds: string[] = [];
      const now = new Date();
      const endDate = new Date(now.getTime() + lookAheadDays * 24 * 60 * 60 * 1000);

      // Get existing sessions for this pattern to avoid duplicates
      const existingResult = await client.query(`
        SELECT scheduled_at FROM sessions 
        WHERE recurring_pattern_id = $1 AND scheduled_at > $2
      `, [patternId, now]);

      const existingSessions = new Set(
        existingResult.rows.map(row => row.scheduled_at.toISOString())
      );

      const sessionDates = this.calculateSessionDates(pattern, now, endDate);

      for (const sessionDate of sessionDates) {
        if (existingSessions.has(sessionDate.toISOString())) {
          continue; // Skip if session already exists
        }

        try {
          const sessionData: SessionData = {
            title: pattern.title,
            description: pattern.description,
            expertiseAreas: pattern.expertiseAreas,
            sessionType: pattern.sessionType,
            scheduledAt: sessionDate,
            duration: pattern.duration,
            capacity: pattern.capacity,
            meetingLink: pattern.meetingLink
          };

          // Create session with pattern reference
          const sessionId = await this.createSessionFromPattern(pattern.mentorId, sessionData, patternId);
          sessionIds.push(sessionId);
        } catch (error) {
          console.error(`Failed to create session for ${sessionDate}:`, error);
          // Continue with other sessions even if one fails
        }
      }

      return sessionIds;
    } finally {
      client.release();
    }
  }

  private calculateSessionDates(pattern: RecurringPattern, startDate: Date, endDate: Date): Date[] {
    const dates: Date[] = [];
    let currentDate = new Date(Math.max(pattern.startDate.getTime(), startDate.getTime()));

    // Parse time of day
    const [hours, minutes] = pattern.timeOfDay.split(':').map(Number);

    while (currentDate <= endDate) {
      if (pattern.endDate && currentDate > pattern.endDate) {
        break;
      }

      if (pattern.maxSessions && dates.length >= pattern.maxSessions) {
        break;
      }

      let nextDate: Date | null = null;

      switch (pattern.frequency) {
        case 'DAILY':
          nextDate = new Date(currentDate);
          nextDate.setHours(hours, minutes, 0, 0);
          if (nextDate > startDate) {
            dates.push(new Date(nextDate));
          }
          currentDate.setDate(currentDate.getDate() + 1);
          break;

        case 'WEEKLY':
          if (pattern.dayOfWeek !== undefined) {
            const dayDiff = (pattern.dayOfWeek - currentDate.getDay() + 7) % 7;
            nextDate = new Date(currentDate);
            nextDate.setDate(currentDate.getDate() + dayDiff);
            nextDate.setHours(hours, minutes, 0, 0);
            
            if (nextDate > startDate) {
              dates.push(new Date(nextDate));
            }
            currentDate.setDate(currentDate.getDate() + 7);
          }
          break;

        case 'BIWEEKLY':
          if (pattern.dayOfWeek !== undefined) {
            const dayDiff = (pattern.dayOfWeek - currentDate.getDay() + 7) % 7;
            nextDate = new Date(currentDate);
            nextDate.setDate(currentDate.getDate() + dayDiff);
            nextDate.setHours(hours, minutes, 0, 0);
            
            if (nextDate > startDate) {
              dates.push(new Date(nextDate));
            }
            currentDate.setDate(currentDate.getDate() + 14);
          }
          break;

        case 'MONTHLY':
          nextDate = new Date(currentDate);
          nextDate.setHours(hours, minutes, 0, 0);
          if (nextDate > startDate) {
            dates.push(new Date(nextDate));
          }
          currentDate.setMonth(currentDate.getMonth() + 1);
          break;
      }

      // Safety check to prevent infinite loops
      if (dates.length > 100) {
        console.warn('Generated more than 100 sessions, stopping to prevent infinite loop');
        break;
      }
    }

    return dates;
  }

  private async createSessionFromPattern(
    mentorId: string, 
    sessionData: SessionData, 
    patternId: string
  ): Promise<string> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      const sessionId = uuidv4();
      const now = new Date();

      // Create session with pattern reference
      await client.query(`
        INSERT INTO sessions (
          id, mentor_id, title, description, expertise_areas, session_type,
          scheduled_at, duration, capacity, current_registrations, status,
          meeting_link, recurring_pattern_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        sessionId,
        mentorId,
        sessionData.title,
        sessionData.description,
        JSON.stringify(sessionData.expertiseAreas),
        sessionData.sessionType,
        sessionData.scheduledAt,
        sessionData.duration,
        sessionData.capacity,
        0,
        'SCHEDULED',
        sessionData.meetingLink || null,
        patternId,
        now,
        now
      ]);

      await client.query('COMMIT');
      return sessionId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private mapPatternFromDb(row: any): RecurringPattern {
    return {
      id: row.id,
      mentorId: row.mentor_id,
      title: row.title,
      description: row.description,
      expertiseAreas: JSON.parse(row.expertise_areas || '[]'),
      sessionType: row.session_type,
      duration: row.duration,
      capacity: row.capacity,
      meetingLink: row.meeting_link,
      frequency: row.frequency,
      dayOfWeek: row.day_of_week,
      timeOfDay: row.time_of_day,
      startDate: row.start_date,
      endDate: row.end_date,
      maxSessions: row.max_sessions,
      timezone: row.timezone,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}