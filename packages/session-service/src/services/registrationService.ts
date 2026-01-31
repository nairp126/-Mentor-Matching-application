import { v4 as uuidv4 } from 'uuid';
import { db } from '../index';

export interface RegistrationResult {
  success: boolean;
  registration?: SessionRegistration;
  waitlistEntry?: WaitlistEntry;
  message: string;
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

export class RegistrationService {
  constructor() {
    // No need for database instance since we use the singleton
  }

  async registerForSession(sessionId: string, studentId: string): Promise<RegistrationResult> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Check if session exists and is available
      const sessionResult = await client.query(`
        SELECT id, capacity, current_registrations, status, scheduled_at
        FROM sessions 
        WHERE id = $1
      `, [sessionId]);

      if (sessionResult.rows.length === 0) {
        return { success: false, message: 'Session not found' };
      }

      const session = sessionResult.rows[0];

      if (session.status !== 'SCHEDULED') {
        return { success: false, message: 'Session is not available for registration' };
      }

      if (new Date(session.scheduled_at) <= new Date()) {
        return { success: false, message: 'Cannot register for past sessions' };
      }

      // Check if student is already registered or on waitlist
      const existingResult = await client.query(`
        SELECT 'registration' as type FROM session_registrations 
        WHERE session_id = $1 AND student_id = $2 AND status != 'CANCELLED'
        UNION
        SELECT 'waitlist' as type FROM session_waitlist 
        WHERE session_id = $1 AND student_id = $2
      `, [sessionId, studentId]);

      if (existingResult.rows.length > 0) {
        const type = existingResult.rows[0].type;
        return { 
          success: false, 
          message: type === 'registration' ? 'Already registered for this session' : 'Already on waitlist for this session'
        };
      }

      // Check if session has capacity
      if (session.current_registrations < session.capacity) {
        // Register directly
        const registrationId = uuidv4();
        const registrationResult = await client.query(`
          INSERT INTO session_registrations (id, session_id, student_id, status, registered_at)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [registrationId, sessionId, studentId, 'CONFIRMED', new Date()]);

        // Update session registration count
        await client.query(`
          UPDATE sessions 
          SET current_registrations = current_registrations + 1, updated_at = $1
          WHERE id = $2
        `, [new Date(), sessionId]);

        await client.query('COMMIT');

        const registration = registrationResult.rows[0];
        return {
          success: true,
          registration: {
            id: registration.id,
            sessionId: registration.session_id,
            studentId: registration.student_id,
            status: registration.status,
            registeredAt: registration.registered_at,
            notes: registration.notes
          },
          message: 'Successfully registered for session'
        };
      } else {
        // Add to waitlist
        const waitlistId = uuidv4();
        
        // Get next position in waitlist
        const positionResult = await client.query(`
          SELECT COALESCE(MAX(position), 0) + 1 as next_position
          FROM session_waitlist 
          WHERE session_id = $1
        `, [sessionId]);

        const position = positionResult.rows[0].next_position;

        const waitlistResult = await client.query(`
          INSERT INTO session_waitlist (id, session_id, student_id, position, added_at, notified)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `, [waitlistId, sessionId, studentId, position, new Date(), false]);

        await client.query('COMMIT');

        const waitlistEntry = waitlistResult.rows[0];
        return {
          success: true,
          waitlistEntry: {
            id: waitlistEntry.id,
            sessionId: waitlistEntry.session_id,
            studentId: waitlistEntry.student_id,
            position: waitlistEntry.position,
            addedAt: waitlistEntry.added_at,
            notified: waitlistEntry.notified
          },
          message: `Added to waitlist at position ${position}`
        };
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelRegistration(sessionId: string, studentId: string): Promise<{ success: boolean; message: string }> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Check if student is registered
      const registrationResult = await client.query(`
        SELECT id, status FROM session_registrations 
        WHERE session_id = $1 AND student_id = $2 AND status = 'CONFIRMED'
      `, [sessionId, studentId]);

      if (registrationResult.rows.length === 0) {
        // Check if on waitlist
        const waitlistResult = await client.query(`
          SELECT id FROM session_waitlist 
          WHERE session_id = $1 AND student_id = $2
        `, [sessionId, studentId]);

        if (waitlistResult.rows.length > 0) {
          // Remove from waitlist
          await client.query(`
            DELETE FROM session_waitlist 
            WHERE session_id = $1 AND student_id = $2
          `, [sessionId, studentId]);

          // Update positions for remaining waitlist entries
          await client.query(`
            UPDATE session_waitlist 
            SET position = position - 1 
            WHERE session_id = $1 AND position > (
              SELECT position FROM session_waitlist 
              WHERE id = $2
            )
          `, [sessionId, waitlistResult.rows[0].id]);

          await client.query('COMMIT');
          return { success: true, message: 'Removed from waitlist' };
        }

        return { success: false, message: 'No active registration or waitlist entry found' };
      }

      // Cancel the registration
      await client.query(`
        UPDATE session_registrations 
        SET status = 'CANCELLED' 
        WHERE session_id = $1 AND student_id = $2
      `, [sessionId, studentId]);

      // Decrease session registration count
      await client.query(`
        UPDATE sessions 
        SET current_registrations = current_registrations - 1, updated_at = $1
        WHERE id = $2
      `, [new Date(), sessionId]);

      // Check if there's someone on the waitlist to promote
      const waitlistResult = await client.query(`
        SELECT id, student_id FROM session_waitlist 
        WHERE session_id = $1 
        ORDER BY position 
        LIMIT 1
      `, [sessionId]);

      if (waitlistResult.rows.length > 0) {
        const waitlistEntry = waitlistResult.rows[0];
        
        // Move from waitlist to registration
        const newRegistrationId = uuidv4();
        await client.query(`
          INSERT INTO session_registrations (id, session_id, student_id, status, registered_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [newRegistrationId, sessionId, waitlistEntry.student_id, 'CONFIRMED', new Date()]);

        // Remove from waitlist
        await client.query(`
          DELETE FROM session_waitlist WHERE id = $1
        `, [waitlistEntry.id]);

        // Update positions for remaining waitlist entries
        await client.query(`
          UPDATE session_waitlist 
          SET position = position - 1 
          WHERE session_id = $1
        `, [sessionId]);

        // Increase registration count back
        await client.query(`
          UPDATE sessions 
          SET current_registrations = current_registrations + 1, updated_at = $1
          WHERE id = $2
        `, [new Date(), sessionId]);

        // TODO: Send notification to promoted student
      }

      await client.query('COMMIT');
      return { success: true, message: 'Registration cancelled successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getRegistration(sessionId: string, studentId: string): Promise<SessionRegistration | null> {
    const client = await db.getClient();
    
    try {
      const result = await client.query(`
        SELECT * FROM session_registrations 
        WHERE session_id = $1 AND student_id = $2
      `, [sessionId, studentId]);

      if (result.rows.length === 0) {
        return null;
      }

      const reg = result.rows[0];
      return {
        id: reg.id,
        sessionId: reg.session_id,
        studentId: reg.student_id,
        status: reg.status,
        registeredAt: reg.registered_at,
        notes: reg.notes
      };
    } finally {
      client.release();
    }
  }

  async getWaitlistEntry(sessionId: string, studentId: string): Promise<WaitlistEntry | null> {
    const client = await db.getClient();
    
    try {
      const result = await client.query(`
        SELECT * FROM session_waitlist 
        WHERE session_id = $1 AND student_id = $2
      `, [sessionId, studentId]);

      if (result.rows.length === 0) {
        return null;
      }

      const entry = result.rows[0];
      return {
        id: entry.id,
        sessionId: entry.session_id,
        studentId: entry.student_id,
        position: entry.position,
        addedAt: entry.added_at,
        notified: entry.notified
      };
    } finally {
      client.release();
    }
  }

  async getSessionRegistrations(sessionId: string): Promise<SessionRegistration[]> {
    const client = await db.getClient();
    
    try {
      const result = await client.query(`
        SELECT * FROM session_registrations 
        WHERE session_id = $1 
        ORDER BY registered_at
      `, [sessionId]);

      return result.rows.map(reg => ({
        id: reg.id,
        sessionId: reg.session_id,
        studentId: reg.student_id,
        status: reg.status,
        registeredAt: reg.registered_at,
        notes: reg.notes
      }));
    } finally {
      client.release();
    }
  }

  async getSessionWaitlist(sessionId: string): Promise<WaitlistEntry[]> {
    const client = await db.getClient();
    
    try {
      const result = await client.query(`
        SELECT * FROM session_waitlist 
        WHERE session_id = $1 
        ORDER BY position
      `, [sessionId]);

      return result.rows.map((entry: any) => ({
        id: entry.id,
        sessionId: entry.session_id,
        studentId: entry.student_id,
        position: entry.position,
        addedAt: entry.added_at,
        notified: entry.notified
      }));
    } finally {
      client.release();
    }
  }

  async updateRegistrationStatus(
    registrationId: string, 
    status: 'CONFIRMED' | 'CANCELLED' | 'ATTENDED' | 'NO_SHOW',
    notes?: string
  ): Promise<SessionRegistration> {
    const client = await db.getClient();
    
    try {
      const result = await client.query(`
        UPDATE session_registrations 
        SET status = $1, notes = $2
        WHERE id = $3
        RETURNING *
      `, [status, notes || null, registrationId]);

      if (result.rows.length === 0) {
        throw new Error('Registration not found');
      }

      const reg = result.rows[0];
      return {
        id: reg.id,
        sessionId: reg.session_id,
        studentId: reg.student_id,
        status: reg.status,
        registeredAt: reg.registered_at,
        notes: reg.notes
      };
    } finally {
      client.release();
    }
  }
}