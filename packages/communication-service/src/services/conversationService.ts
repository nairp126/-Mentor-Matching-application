import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '@mentor-platform/shared';
import { Message } from './messageService';

export interface Conversation {
  id: string;
  participants: string[];
  type: 'DIRECT' | 'GROUP' | 'SESSION';
  title?: string;
  metadata?: Record<string, any>;
  lastMessage?: Message;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationWithDetails extends Conversation {
  unreadCount: number;
  participantProfiles: Array<{
    userId: string;
    firstName: string;
    lastName: string;
    role: string;
    profileImageUrl?: string;
  }>;
}

export class ConversationService {
  private db: DatabaseManager;

  constructor(db?: DatabaseManager) {
    // Use provided db or create a default one for production
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

  async createConversation(
    participants: string[],
    type: 'DIRECT' | 'GROUP' | 'SESSION' = 'DIRECT',
    title?: string,
    metadata?: Record<string, any>
  ): Promise<Conversation> {
    if (participants.length < 2) {
      throw new Error('Conversation must have at least 2 participants');
    }

    // For direct conversations, check if one already exists
    if (type === 'DIRECT' && participants.length === 2) {
      const existing = await this.findDirectConversation(participants[0], participants[1]);
      if (existing) {
        return existing;
      }
    }

    const conversationId = uuidv4();
    const now = new Date();

    try {
      return await this.db.transaction(async (client) => {
        // Create conversation
        const conversationQuery = `
          INSERT INTO conversations (id, type, title, metadata, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `;

        const conversationResult = await client.query(conversationQuery, [
          conversationId,
          type,
          title,
          metadata ? JSON.stringify(metadata) : null,
          now,
          now
        ]);

        // Add participants
        const participantQuery = `
          INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
          VALUES ($1, $2, $3)
        `;

        for (const userId of participants) {
          await client.query(participantQuery, [conversationId, userId, now]);
        }

        const row = conversationResult.rows[0];
        return {
          id: row.id,
          participants,
          type: row.type,
          title: row.title,
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      });
    } catch (error: any) {
      throw new Error(`Failed to create conversation: ${error.message}`);
    }
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    const query = `
      SELECT c.*, 
             array_agg(cp.user_id) as participants,
             m.id as last_message_id,
             m.from_user_id as last_message_from,
             m.content as last_message_content,
             m.type as last_message_type,
             m.created_at as last_message_created_at
      FROM conversations c
      LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
      LEFT JOIN messages m ON c.id = m.conversation_id 
        AND m.created_at = (
          SELECT MAX(created_at) 
          FROM messages 
          WHERE conversation_id = c.id
        )
      WHERE c.id = $1
      GROUP BY c.id, c.type, c.title, c.metadata, c.created_at, c.updated_at,
               m.id, m.from_user_id, m.content, m.type, m.created_at
    `;

    try {
      const result = await this.db.query(query, [conversationId]);
      
      if (result.rows.length === 0) {
        throw new Error('Conversation not found');
      }

      const row = result.rows[0];
      const conversation: Conversation = {
        id: row.id,
        participants: row.participants || [],
        type: row.type,
        title: row.title,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };

      if (row.last_message_id) {
        conversation.lastMessage = {
          id: row.last_message_id,
          conversationId: row.id,
          fromUserId: row.last_message_from,
          content: row.last_message_content,
          type: row.last_message_type,
          createdAt: row.last_message_created_at,
          readBy: []
        };
      }

      return conversation;
    } catch (error: any) {
      throw new Error(`Failed to get conversation: ${error.message}`);
    }
  }

  async getUserConversations(userId: string): Promise<ConversationWithDetails[]> {
    const query = `
      SELECT c.*, 
             array_agg(DISTINCT cp.user_id) as participants,
             m.id as last_message_id,
             m.from_user_id as last_message_from,
             m.content as last_message_content,
             m.type as last_message_type,
             m.created_at as last_message_created_at,
             COUNT(unread_m.id) as unread_count
      FROM conversations c
      JOIN conversation_participants cp ON c.id = cp.conversation_id
      LEFT JOIN messages m ON c.id = m.conversation_id 
        AND m.created_at = (
          SELECT MAX(created_at) 
          FROM messages 
          WHERE conversation_id = c.id
        )
      LEFT JOIN messages unread_m ON c.id = unread_m.conversation_id
        AND unread_m.from_user_id != $1
        AND NOT EXISTS (
          SELECT 1 FROM message_reads mr 
          WHERE mr.message_id = unread_m.id AND mr.user_id = $1
        )
      WHERE cp.user_id = $1
      GROUP BY c.id, c.type, c.title, c.metadata, c.created_at, c.updated_at,
               m.id, m.from_user_id, m.content, m.type, m.created_at
      ORDER BY COALESCE(m.created_at, c.updated_at) DESC
    `;

    try {
      const result = await this.db.query(query, [userId]);
      
      const conversations: ConversationWithDetails[] = [];

      for (const row of result.rows) {
        // Get participant profiles
        const participantProfiles = await this.getParticipantProfiles(row.participants);

        const conversation: ConversationWithDetails = {
          id: row.id,
          participants: row.participants || [],
          type: row.type,
          title: row.title,
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          unreadCount: parseInt(row.unread_count) || 0,
          participantProfiles
        };

        if (row.last_message_id) {
          conversation.lastMessage = {
            id: row.last_message_id,
            conversationId: row.id,
            fromUserId: row.last_message_from,
            content: row.last_message_content,
            type: row.last_message_type,
            createdAt: row.last_message_created_at,
            readBy: []
          };
        }

        conversations.push(conversation);
      }

      return conversations;
    } catch (error: any) {
      throw new Error(`Failed to get user conversations: ${error.message}`);
    }
  }

  async findDirectConversation(userId1: string, userId2: string): Promise<Conversation | null> {
    const query = `
      SELECT c.*, array_agg(cp.user_id) as participants
      FROM conversations c
      JOIN conversation_participants cp ON c.id = cp.conversation_id
      WHERE c.type = 'DIRECT'
      GROUP BY c.id, c.type, c.title, c.metadata, c.created_at, c.updated_at
      HAVING array_agg(cp.user_id) @> ARRAY[$1, $2]::text[]
        AND array_length(array_agg(cp.user_id), 1) = 2
    `;

    try {
      const result = await this.db.query(query, [userId1, userId2]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        participants: row.participants,
        type: row.type,
        title: row.title,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error: any) {
      throw new Error(`Failed to find direct conversation: ${error.message}`);
    }
  }

  async updateLastMessage(conversationId: string, message: Message): Promise<void> {
    const query = `
      UPDATE conversations 
      SET updated_at = $1
      WHERE id = $2
    `;

    try {
      await this.db.query(query, [message.createdAt, conversationId]);
    } catch (error: any) {
      throw new Error(`Failed to update conversation: ${error.message}`);
    }
  }

  async addParticipant(conversationId: string, userId: string): Promise<void> {
    const query = `
      INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (conversation_id, user_id) DO NOTHING
    `;

    try {
      await this.db.query(query, [conversationId, userId, new Date()]);
    } catch (error: any) {
      throw new Error(`Failed to add participant: ${error.message}`);
    }
  }

  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    const query = `
      DELETE FROM conversation_participants 
      WHERE conversation_id = $1 AND user_id = $2
    `;

    try {
      await this.db.query(query, [conversationId, userId]);
    } catch (error: any) {
      throw new Error(`Failed to remove participant: ${error.message}`);
    }
  }

  async updateConversation(
    conversationId: string,
    updates: { title?: string; metadata?: Record<string, any> }
  ): Promise<Conversation> {
    const setClause: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (updates.title !== undefined) {
      paramCount++;
      setClause.push(`title = $${paramCount}`);
      values.push(updates.title);
    }

    if (updates.metadata !== undefined) {
      paramCount++;
      setClause.push(`metadata = $${paramCount}`);
      values.push(JSON.stringify(updates.metadata));
    }

    if (setClause.length === 0) {
      throw new Error('No updates provided');
    }

    paramCount++;
    setClause.push(`updated_at = $${paramCount}`);
    values.push(new Date());

    paramCount++;
    values.push(conversationId);

    const query = `
      UPDATE conversations 
      SET ${setClause.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    try {
      const result = await this.db.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Conversation not found');
      }

      // Get full conversation with participants
      return await this.getConversation(conversationId);
    } catch (error: any) {
      throw new Error(`Failed to update conversation: ${error.message}`);
    }
  }

  private async getParticipantProfiles(userIds: string[]): Promise<Array<{
    userId: string;
    firstName: string;
    lastName: string;
    role: string;
    profileImageUrl?: string;
  }>> {
    if (!userIds || userIds.length === 0) {
      return [];
    }

    const query = `
      SELECT u.id as user_id, u.role,
             COALESCE(mp.first_name, sp.first_name) as first_name,
             COALESCE(mp.last_name, sp.last_name) as last_name,
             COALESCE(mp.profile_image_url, sp.profile_image_url) as profile_image_url
      FROM users u
      LEFT JOIN mentor_profiles mp ON u.id = mp.user_id
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      WHERE u.id = ANY($1)
    `;

    try {
      const result = await this.db.query(query, [userIds]);
      
      return result.rows.map((row: any) => ({
        userId: row.user_id,
        firstName: row.first_name || 'Unknown',
        lastName: row.last_name || 'User',
        role: row.role,
        profileImageUrl: row.profile_image_url
      }));
    } catch (error: any) {
      console.error('Failed to get participant profiles:', error);
      // Return basic info if profile fetch fails
      return userIds.map(userId => ({
        userId,
        firstName: 'Unknown',
        lastName: 'User',
        role: 'UNKNOWN'
      }));
    }
  }
}