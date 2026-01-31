import { v4 as uuidv4 } from 'uuid';
import { db } from '../index';

export interface Session {
  id: string;
  mentorId: string;
  title: string;
  description: string;
  expertiseAreas: string[];
  sessionType: 'ONE_ON_ONE' | 'GROUP' | 'WORKSHOP';
  scheduledAt: Date;
  duration: number;
  capacity: number;
  currentRegistrations: number;
  registeredStudents: SessionRegistration[];
  waitlist: WaitlistEntry[];
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  meetingLink?: string;
  materials: SessionMaterial[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRegistration {
  id: string;
  sessionId: string;
  studentId: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'ATTENDED' | 'NO_SHOW';
  registeredAt: Date;
  notes?: string;
}

export interface WaitlistEntry {
  id: string;
  sessionId: string;
  studentId: string;
  position: number;
  addedAt: Date;
  notified: boolean;
}

export interface SessionMaterial {
  id: string;
  sessionId: string;
  title: string;
  description?: string;
  url: string;
  type: 'DOCUMENT' | 'VIDEO' | 'LINK' | 'PRESENTATION';
  uploadedAt: Date;
}

export interface SessionData {
  title: string;
  description: string;
  expertiseAreas: string[];
  sessionType: 'ONE_ON_ONE' | 'GROUP' | 'WORKSHOP';
  scheduledAt: Date;
  duration: number;
  capacity: number;
  meetingLink?: string;
}

export interface SessionFilters {
  mentorId?: string;
  studentId?: string;
  expertiseAreas?: string[];
  sessionType?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class SessionService {
  constructor() { }

  async createSession(mentorId: string, sessionData: SessionData): Promise<Session> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');
      const sessionId = uuidv4();
      const now = new Date();

      const sessionResult = await client.query(`
        INSERT INTO sessions (
          id, mentor_id, title, description, expertise_areas, session_type,
          scheduled_at, duration, capacity, current_registrations, status,
          meeting_link, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `, [
        sessionId, mentorId, sessionData.title, sessionData.description,
        JSON.stringify(sessionData.expertiseAreas), sessionData.sessionType,
        sessionData.scheduledAt, sessionData.duration, sessionData.capacity,
        0, 'SCHEDULED', sessionData.meetingLink || null, now, now
      ]);

      await client.query('COMMIT');
      return this.mapSessionFromDb(sessionResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const client = await db.getClient();

    try {
      const result = await client.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
      if (result.rows.length === 0) return null;
      return await this.enrichSessionData(client, result.rows[0]);
    } finally {
      client.release();
    }
  }

  private async enrichSessionData(client: any, sessionRow: any): Promise<Session> {
    const registrationsResult = await client.query(
      'SELECT * FROM session_registrations WHERE session_id = $1 ORDER BY registered_at',
      [sessionRow.id]
    );

    const waitlistResult = await client.query(
      'SELECT * FROM session_waitlist WHERE session_id = $1 ORDER BY position',
      [sessionRow.id]
    );

    const materialsResult = await client.query(
      'SELECT * FROM session_materials WHERE session_id = $1 ORDER BY uploaded_at',
      [sessionRow.id]
    );

    return this.mapSessionFromDb(sessionRow, {
      registrations: registrationsResult.rows,
      waitlist: waitlistResult.rows,
      materials: materialsResult.rows
    });
  }

  private mapSessionFromDb(sessionRow: any, related?: any): Session {
    return {
      id: sessionRow.id,
      mentorId: sessionRow.mentor_id,
      title: sessionRow.title,
      description: sessionRow.description,
      expertiseAreas: JSON.parse(sessionRow.expertise_areas || '[]'),
      sessionType: sessionRow.session_type,
      scheduledAt: sessionRow.scheduled_at,
      duration: sessionRow.duration,
      capacity: sessionRow.capacity,
      currentRegistrations: sessionRow.current_registrations,
      registeredStudents: related?.registrations?.map((reg: any) => ({
        id: reg.id,
        sessionId: reg.session_id,
        studentId: reg.student_id,
        status: reg.status,
        registeredAt: reg.registered_at,
        notes: reg.notes
      })) || [],
      waitlist: related?.waitlist?.map((wait: any) => ({
        id: wait.id,
        sessionId: wait.session_id,
        studentId: wait.student_id,
        position: wait.position,
        addedAt: wait.added_at,
        notified: wait.notified
      })) || [],
      status: sessionRow.status,
      meetingLink: sessionRow.meeting_link,
      materials: related?.materials?.map((mat: any) => ({
        id: mat.id,
        sessionId: mat.session_id,
        title: mat.title,
        description: mat.description,
        url: mat.url,
        type: mat.type,
        uploadedAt: mat.uploaded_at
      })) || [],
      createdAt: sessionRow.created_at,
      updatedAt: sessionRow.updated_at
    };
  }

  async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<Session> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Get current session
      const currentResult = await client.query(
        'SELECT * FROM sessions WHERE id = $1',
        [sessionId]
      );

      if (currentResult.rows.length === 0) {
        throw new Error('Session not found');
      }

      const currentSession = currentResult.rows[0];

      // Check for scheduling conflicts if time/duration is being updated
      if (updates.scheduledAt || updates.duration) {
        const newScheduledAt = updates.scheduledAt || currentSession.scheduled_at;
        const newDuration = updates.duration || currentSession.duration;

        const conflictCheck = await this.checkSchedulingConflict(
          client,
          currentSession.mentor_id,
          newScheduledAt,
          newDuration,
          sessionId
        );

        if (conflictCheck.hasConflict) {
          throw new Error(`Scheduling conflict: ${conflictCheck.message}`);
        }
      }

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
      if (updates.scheduledAt !== undefined) {
        updateFields.push(`scheduled_at = $${paramCount++}`);
        values.push(updates.scheduledAt);
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

      if (updateFields.length === 0) {
        await client.query('COMMIT');
        return await this.getSession(sessionId) as Session;
      }

      updateFields.push(`updated_at = $${paramCount++}`);
      values.push(new Date());
      values.push(sessionId);

      await client.query(`
        UPDATE sessions 
        SET ${updateFields.join(', ')} 
        WHERE id = $${paramCount}
      `, values);

      await client.query('COMMIT');

      const updatedSession = await this.getSession(sessionId);
      if (!updatedSession) {
        throw new Error('Failed to retrieve updated session');
      }

      return updatedSession;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Check if session exists and get current registrations
      const sessionResult = await client.query(
        'SELECT current_registrations FROM sessions WHERE id = $1',
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        throw new Error('Session not found');
      }

      const currentRegistrations = sessionResult.rows[0].current_registrations;

      if (currentRegistrations > 0) {
        // Cancel all registrations instead of deleting
        await client.query(
          'UPDATE sessions SET status = $1, updated_at = $2 WHERE id = $3',
          ['CANCELLED', new Date(), sessionId]
        );

        // Update all registrations to cancelled
        await client.query(
          'UPDATE session_registrations SET status = $1 WHERE session_id = $2',
          ['CANCELLED', sessionId]
        );
      } else {
        // Safe to delete if no registrations
        await client.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getAvailableSessions(filters: SessionFilters): Promise<Session[]> {
    const client = await db.getClient();

    try {
      let query = `
        SELECT * FROM sessions 
        WHERE status = 'SCHEDULED' 
          AND scheduled_at > NOW()
          AND current_registrations < capacity
      `;

      const values = [];
      let paramCount = 1;

      if (filters.expertiseAreas && filters.expertiseAreas.length > 0) {
        query += ` AND expertise_areas::jsonb ?| $${paramCount++}`;
        values.push(filters.expertiseAreas);
      }

      if (filters.sessionType) {
        query += ` AND session_type = $${paramCount++}`;
        values.push(filters.sessionType);
      }

      if (filters.startDate) {
        query += ` AND scheduled_at >= $${paramCount++}`;
        values.push(filters.startDate.toISOString());
      }

      if (filters.endDate) {
        query += ` AND scheduled_at <= $${paramCount++}`;
        values.push(filters.endDate.toISOString());
      }

      query += ' ORDER BY scheduled_at ASC';

      if (filters.limit) {
        query += ` LIMIT $${paramCount++}`;
        values.push(filters.limit.toString());
      }

      if (filters.offset) {
        query += ` OFFSET $${paramCount++}`;
        values.push(filters.offset.toString());
      }

      const result = await client.query(query, values);

      const sessions = [];
      for (const row of result.rows) {
        const enrichedSession = await this.enrichSessionData(client, row);
        sessions.push(enrichedSession);
      }

      return sessions;
    } finally {
      client.release();
    }
  }

  async getMentorSessions(mentorId: string, filters?: SessionFilters): Promise<Session[]> {
    const client = await db.getClient();

    try {
      let query = 'SELECT * FROM sessions WHERE mentor_id = $1';
      const values = [mentorId];
      let paramCount = 2;

      if (filters?.status) {
        query += ` AND status = $${paramCount++}`;
        values.push(filters.status);
      }

      if (filters?.startDate) {
        query += ` AND scheduled_at >= $${paramCount++}`;
        values.push(filters.startDate.toISOString());
      }

      if (filters?.endDate) {
        query += ` AND scheduled_at <= $${paramCount++}`;
        values.push(filters.endDate.toISOString());
      }

      query += ' ORDER BY scheduled_at DESC';

      if (filters?.limit) {
        query += ` LIMIT $${paramCount++}`;
        values.push(filters.limit.toString());
      }

      if (filters?.offset) {
        query += ` OFFSET $${paramCount++}`;
        values.push(filters.offset.toString());
      }

      const result = await client.query(query, values);

      const sessions = [];
      for (const row of result.rows) {
        const enrichedSession = await this.enrichSessionData(client, row);
        sessions.push(enrichedSession);
      }

      return sessions;
    } finally {
      client.release();
    }
  }

  async getStudentSessions(studentId: string, filters?: SessionFilters): Promise<Session[]> {
    const client = await db.getClient();

    try {
      let query = `
        SELECT s.* FROM sessions s
        JOIN session_registrations sr ON s.id = sr.session_id
        WHERE sr.student_id = $1 AND sr.status = 'CONFIRMED'
      `;

      const values = [studentId];
      let paramCount = 2;

      if (filters?.status) {
        query += ` AND s.status = $${paramCount++}`;
        values.push(filters.status);
      }

      if (filters?.startDate) {
        query += ` AND s.scheduled_at >= $${paramCount++}`;
        values.push(filters.startDate.toISOString());
      }

      if (filters?.endDate) {
        query += ` AND s.scheduled_at <= $${paramCount++}`;
        values.push(filters.endDate.toISOString());
      }

      query += ' ORDER BY s.scheduled_at ASC';

      if (filters?.limit) {
        query += ` LIMIT $${paramCount++}`;
        values.push(filters.limit.toString());
      }

      if (filters?.offset) {
        query += ` OFFSET $${paramCount++}`;
        values.push(filters.offset.toString());
      }

      const result = await client.query(query, values);

      const sessions = [];
      for (const row of result.rows) {
        const enrichedSession = await this.enrichSessionData(client, row);
        sessions.push(enrichedSession);
      }

      return sessions;
    } finally {
      client.release();
    }
  }

  private async checkSchedulingConflict(
    client: any,
    mentorId: string,
    scheduledAt: Date,
    duration: number,
    excludeSessionId?: string
  ): Promise<{ hasConflict: boolean; message?: string }> {
    const endTime = new Date(new Date(scheduledAt).getTime() + duration * 60000);

    let query = `
      SELECT * FROM sessions 
      WHERE mentor_id = $1 
        AND status IN ('SCHEDULED', 'IN_PROGRESS')
        AND (
          (scheduled_at <= $2 AND scheduled_at + (duration * interval '1 minute') > $2)
          OR (scheduled_at < $3 AND scheduled_at + (duration * interval '1 minute') >= $3)
          OR (scheduled_at >= $2 AND scheduled_at + (duration * interval '1 minute') <= $3)
        )
    `;

    const values: any[] = [mentorId, scheduledAt, endTime];

    if (excludeSessionId) {
      query += ' AND id != $4';
      values.push(excludeSessionId);
    }

    const result = await client.query(query, values);

    if (result.rows.length > 0) {
      return {
        hasConflict: true,
        message: `Conflicts with session "${result.rows[0].title}" scheduled at ${result.rows[0].scheduled_at}`
      };
    }

    return { hasConflict: false };
  }
}