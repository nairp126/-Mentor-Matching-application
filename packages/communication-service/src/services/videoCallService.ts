import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '@mentor-platform/shared';

export interface VideoCallSession {
  id: string;
  conversationId: string;
  initiatorId: string;
  participantIds: string[];
  status: 'INITIATED' | 'RINGING' | 'ACTIVE' | 'ENDED' | 'FAILED';
  startedAt?: Date;
  endedAt?: Date;
  duration?: number; // in seconds
  roomId: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CallInvitation {
  callId: string;
  fromUserId: string;
  toUserId: string;
  conversationId: string;
  roomId: string;
  expiresAt: Date;
}

export class VideoCallService {
  private db: DatabaseManager;
  private activeRooms: Map<string, VideoCallSession> = new Map();

  constructor(db?: DatabaseManager) {
    this.db = db || new DatabaseManager(
      {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'mentor_platform',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password'
      },
      {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379')
      }
    );
  }

  /**
   * Initiate a video call between users
   */
  async initiateCall(
    conversationId: string,
    initiatorId: string,
    participantIds: string[],
    metadata?: Record<string, any>
  ): Promise<VideoCallSession> {
    const callId = uuidv4();
    const roomId = `room_${callId}`;
    const now = new Date();

    // Create call session in database
    const query = `
      INSERT INTO video_call_sessions (
        id, conversation_id, initiator_id, participant_ids, status, room_id, metadata, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      callId,
      conversationId,
      initiatorId,
      JSON.stringify(participantIds),
      'INITIATED',
      roomId,
      metadata ? JSON.stringify(metadata) : null,
      now,
      now
    ];

    try {
      const result = await this.db.query(query, values);
      const row = result.rows[0];

      const callSession: VideoCallSession = {
        id: row.id,
        conversationId: row.conversation_id,
        initiatorId: row.initiator_id,
        participantIds: JSON.parse(row.participant_ids),
        status: row.status,
        roomId: row.room_id,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };

      // Store in active rooms cache
      this.activeRooms.set(callId, callSession);

      return callSession;
    } catch (error: any) {
      throw new Error(`Failed to initiate call: ${error.message}`);
    }
  }

  /**
   * Accept a video call invitation
   */
  async acceptCall(callId: string, userId: string): Promise<VideoCallSession> {
    const callSession = await this.getCallSession(callId);

    if (!callSession.participantIds.includes(userId) && callSession.initiatorId !== userId) {
      throw new Error('User not authorized to accept this call');
    }

    if (callSession.status !== 'INITIATED' && callSession.status !== 'RINGING') {
      throw new Error('Call cannot be accepted in current state');
    }

    // Update call status to active
    const query = `
      UPDATE video_call_sessions 
      SET status = $1, started_at = $2, updated_at = $3
      WHERE id = $4
      RETURNING *
    `;

    const now = new Date();
    const values = ['ACTIVE', now, now, callId];

    try {
      const result = await this.db.query(query, values);
      const row = result.rows[0];

      const updatedSession: VideoCallSession = {
        id: row.id,
        conversationId: row.conversation_id,
        initiatorId: row.initiator_id,
        participantIds: JSON.parse(row.participant_ids),
        status: row.status,
        startedAt: row.started_at,
        roomId: row.room_id,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };

      // Update active rooms cache
      this.activeRooms.set(callId, updatedSession);

      return updatedSession;
    } catch (error: any) {
      throw new Error(`Failed to accept call: ${error.message}`);
    }
  }

  /**
   * Reject or end a video call
   */
  async endCall(callId: string, userId: string, reason?: string): Promise<VideoCallSession> {
    const callSession = await this.getCallSession(callId);

    if (!callSession.participantIds.includes(userId) && callSession.initiatorId !== userId) {
      throw new Error('User not authorized to end this call');
    }

    const now = new Date();
    let duration: number | undefined;

    if (callSession.startedAt) {
      duration = Math.floor((now.getTime() - callSession.startedAt.getTime()) / 1000);
    }

    const query = `
      UPDATE video_call_sessions 
      SET status = $1, ended_at = $2, duration = $3, updated_at = $4, metadata = $5
      WHERE id = $6
      RETURNING *
    `;

    const metadata = {
      ...callSession.metadata,
      endReason: reason || 'user_ended',
      endedBy: userId
    };

    const values = ['ENDED', now, duration, now, JSON.stringify(metadata), callId];

    try {
      const result = await this.db.query(query, values);
      const row = result.rows[0];

      const endedSession: VideoCallSession = {
        id: row.id,
        conversationId: row.conversation_id,
        initiatorId: row.initiator_id,
        participantIds: JSON.parse(row.participant_ids),
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        duration: row.duration,
        roomId: row.room_id,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };

      // Remove from active rooms cache
      this.activeRooms.delete(callId);

      return endedSession;
    } catch (error: any) {
      throw new Error(`Failed to end call: ${error.message}`);
    }
  }

  /**
   * Get call session details
   */
  async getCallSession(callId: string): Promise<VideoCallSession> {
    // Check cache first
    const cached = this.activeRooms.get(callId);
    if (cached) {
      return cached;
    }

    // Query database
    const query = `
      SELECT * FROM video_call_sessions WHERE id = $1
    `;

    try {
      const result = await this.db.query(query, [callId]);
      
      if (result.rows.length === 0) {
        throw new Error('Call session not found');
      }

      const row = result.rows[0];
      const callSession: VideoCallSession = {
        id: row.id,
        conversationId: row.conversation_id,
        initiatorId: row.initiator_id,
        participantIds: JSON.parse(row.participant_ids),
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        duration: row.duration,
        roomId: row.room_id,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };

      // Cache active sessions
      if (callSession.status === 'ACTIVE' || callSession.status === 'RINGING') {
        this.activeRooms.set(callId, callSession);
      }

      return callSession;
    } catch (error: any) {
      throw new Error(`Failed to get call session: ${error.message}`);
    }
  }

  /**
   * Get user's call history
   */
  async getUserCallHistory(userId: string, limit: number = 50, offset: number = 0): Promise<VideoCallSession[]> {
    const query = `
      SELECT * FROM video_call_sessions 
      WHERE initiator_id = $1 OR participant_ids::jsonb ? $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    try {
      const result = await this.db.query(query, [userId, limit, offset]);
      
      return result.rows.map((row: any) => ({
        id: row.id,
        conversationId: row.conversation_id,
        initiatorId: row.initiator_id,
        participantIds: JSON.parse(row.participant_ids),
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        duration: row.duration,
        roomId: row.room_id,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error: any) {
      throw new Error(`Failed to get call history: ${error.message}`);
    }
  }

  /**
   * Generate WebRTC configuration for client
   */
  generateWebRTCConfig(): any {
    // In production, you would use TURN servers for NAT traversal
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Add TURN servers for production
        // {
        //   urls: 'turn:your-turn-server.com:3478',
        //   username: 'username',
        //   credential: 'password'
        // }
      ],
      iceCandidatePoolSize: 10
    };
  }

  /**
   * Get active call sessions for monitoring
   */
  getActiveCallSessions(): VideoCallSession[] {
    return Array.from(this.activeRooms.values());
  }

  /**
   * Clean up expired call sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    const expiredTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

    const query = `
      UPDATE video_call_sessions 
      SET status = 'FAILED', ended_at = NOW(), updated_at = NOW()
      WHERE status IN ('INITIATED', 'RINGING') 
        AND created_at < $1
      RETURNING id
    `;

    try {
      const result = await this.db.query(query, [expiredTime]);
      
      // Remove from active rooms cache
      result.rows.forEach((row: any) => {
        this.activeRooms.delete(row.id);
      });

      if (result.rows.length > 0) {
        console.log(`Cleaned up ${result.rows.length} expired call sessions`);
      }
    } catch (error: any) {
      console.error('Failed to cleanup expired sessions:', error);
    }
  }

  /**
   * Update call status (for internal use)
   */
  async updateCallStatus(callId: string, status: VideoCallSession['status']): Promise<void> {
    const query = `
      UPDATE video_call_sessions 
      SET status = $1, updated_at = $2
      WHERE id = $3
    `;

    try {
      await this.db.query(query, [status, new Date(), callId]);
      
      // Update cache
      const cached = this.activeRooms.get(callId);
      if (cached) {
        cached.status = status;
        cached.updatedAt = new Date();
      }
    } catch (error: any) {
      throw new Error(`Failed to update call status: ${error.message}`);
    }
  }
}