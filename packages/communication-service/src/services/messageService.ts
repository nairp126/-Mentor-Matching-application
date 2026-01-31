import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '@mentor-platform/shared';

export interface Message {
  id: string;
  conversationId: string;
  fromUserId: string;
  content: string;
  type: 'TEXT' | 'FILE' | 'IMAGE' | 'SYSTEM';
  metadata?: Record<string, any>;
  createdAt: Date;
  editedAt?: Date;
  readBy: string[];
}

export interface MessageFilters {
  conversationId?: string;
  fromUserId?: string;
  type?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class MessageService {
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

  async sendMessage(
    conversationId: string,
    fromUserId: string,
    content: string,
    type: 'TEXT' | 'FILE' | 'IMAGE' | 'SYSTEM' = 'TEXT',
    metadata?: Record<string, any>
  ): Promise<Message> {
    const messageId = uuidv4();
    const now = new Date();

    const query = `
      INSERT INTO messages (id, conversation_id, from_user_id, content, type, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      messageId,
      conversationId,
      fromUserId,
      content,
      type,
      metadata ? JSON.stringify(metadata) : null,
      now
    ];

    try {
      const result = await this.db.query(query, values);
      const row = result.rows[0];

      return {
        id: row.id,
        conversationId: row.conversation_id,
        fromUserId: row.from_user_id,
        content: row.content,
        type: row.type,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        editedAt: row.edited_at,
        readBy: []
      };
    } catch (error: any) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  async getMessage(messageId: string): Promise<Message> {
    const query = `
      SELECT m.*, 
             COALESCE(
               array_agg(mr.user_id) FILTER (WHERE mr.user_id IS NOT NULL), 
               ARRAY[]::text[]
             ) as read_by
      FROM messages m
      LEFT JOIN message_reads mr ON m.id = mr.message_id
      WHERE m.id = $1
      GROUP BY m.id, m.conversation_id, m.from_user_id, m.content, m.type, m.metadata, m.created_at, m.edited_at
    `;

    try {
      const result = await this.db.query(query, [messageId]);
      
      if (result.rows.length === 0) {
        throw new Error('Message not found');
      }

      const row = result.rows[0];
      return {
        id: row.id,
        conversationId: row.conversation_id,
        fromUserId: row.from_user_id,
        content: row.content,
        type: row.type,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        editedAt: row.edited_at,
        readBy: row.read_by || []
      };
    } catch (error: any) {
      throw new Error(`Failed to get message: ${error.message}`);
    }
  }

  async getMessages(filters: MessageFilters): Promise<Message[]> {
    let query = `
      SELECT m.*, 
             COALESCE(
               array_agg(mr.user_id) FILTER (WHERE mr.user_id IS NOT NULL), 
               ARRAY[]::text[]
             ) as read_by
      FROM messages m
      LEFT JOIN message_reads mr ON m.id = mr.message_id
      WHERE 1=1
    `;
    
    const values: any[] = [];
    let paramCount = 0;

    if (filters.conversationId) {
      paramCount++;
      query += ` AND m.conversation_id = $${paramCount}`;
      values.push(filters.conversationId);
    }

    if (filters.fromUserId) {
      paramCount++;
      query += ` AND m.from_user_id = $${paramCount}`;
      values.push(filters.fromUserId);
    }

    if (filters.type) {
      paramCount++;
      query += ` AND m.type = $${paramCount}`;
      values.push(filters.type);
    }

    if (filters.startDate) {
      paramCount++;
      query += ` AND m.created_at >= $${paramCount}`;
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      paramCount++;
      query += ` AND m.created_at <= $${paramCount}`;
      values.push(filters.endDate);
    }

    query += `
      GROUP BY m.id, m.conversation_id, m.from_user_id, m.content, m.type, m.metadata, m.created_at, m.edited_at
      ORDER BY m.created_at DESC
    `;

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
    }

    if (filters.offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      values.push(filters.offset);
    }

    try {
      const result = await this.db.query(query, values);
      
      return result.rows.map((row: any) => ({
        id: row.id,
        conversationId: row.conversation_id,
        fromUserId: row.from_user_id,
        content: row.content,
        type: row.type,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        editedAt: row.edited_at,
        readBy: row.read_by || []
      }));
    } catch (error: any) {
      throw new Error(`Failed to get messages: ${error.message}`);
    }
  }

  async markAsRead(messageId: string, userId: string): Promise<void> {
    const query = `
      INSERT INTO message_reads (message_id, user_id, read_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = $3
    `;

    try {
      await this.db.query(query, [messageId, userId, new Date()]);
    } catch (error: any) {
      throw new Error(`Failed to mark message as read: ${error.message}`);
    }
  }

  async editMessage(messageId: string, userId: string, newContent: string): Promise<Message> {
    const query = `
      UPDATE messages 
      SET content = $1, edited_at = $2
      WHERE id = $3 AND from_user_id = $4
      RETURNING *
    `;

    try {
      const result = await this.db.query(query, [newContent, new Date(), messageId, userId]);
      
      if (result.rows.length === 0) {
        throw new Error('Message not found or not authorized to edit');
      }

      const row = result.rows[0];
      return {
        id: row.id,
        conversationId: row.conversation_id,
        fromUserId: row.from_user_id,
        content: row.content,
        type: row.type,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        editedAt: row.edited_at,
        readBy: []
      };
    } catch (error: any) {
      throw new Error(`Failed to edit message: ${error.message}`);
    }
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const query = `
      DELETE FROM messages 
      WHERE id = $1 AND from_user_id = $2
    `;

    try {
      const result = await this.db.query(query, [messageId, userId]);
      
      if (result.rowCount === 0) {
        throw new Error('Message not found or not authorized to delete');
      }
    } catch (error: any) {
      throw new Error(`Failed to delete message: ${error.message}`);
    }
  }

  async searchMessages(conversationId: string, searchTerm: string, limit: number = 50): Promise<Message[]> {
    const query = `
      SELECT m.*, 
             COALESCE(
               array_agg(mr.user_id) FILTER (WHERE mr.user_id IS NOT NULL), 
               ARRAY[]::text[]
             ) as read_by
      FROM messages m
      LEFT JOIN message_reads mr ON m.id = mr.message_id
      WHERE m.conversation_id = $1 
        AND m.content ILIKE $2
        AND m.type = 'TEXT'
      GROUP BY m.id, m.conversation_id, m.from_user_id, m.content, m.type, m.metadata, m.created_at, m.edited_at
      ORDER BY m.created_at DESC
      LIMIT $3
    `;

    try {
      const result = await this.db.query(query, [conversationId, `%${searchTerm}%`, limit]);
      
      return result.rows.map((row: any) => ({
        id: row.id,
        conversationId: row.conversation_id,
        fromUserId: row.from_user_id,
        content: row.content,
        type: row.type,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        editedAt: row.edited_at,
        readBy: row.read_by || []
      }));
    } catch (error: any) {
      throw new Error(`Failed to search messages: ${error.message}`);
    }
  }

  async getUnreadCount(userId: string, conversationId?: string): Promise<number> {
    let query = `
      SELECT COUNT(*) as unread_count
      FROM messages m
      LEFT JOIN message_reads mr ON m.id = mr.message_id AND mr.user_id = $1
      WHERE m.from_user_id != $1 
        AND mr.message_id IS NULL
    `;
    
    const values = [userId];

    if (conversationId) {
      query += ` AND m.conversation_id = $2`;
      values.push(conversationId);
    }

    try {
      const result = await this.db.query(query, values);
      return parseInt(result.rows[0].unread_count);
    } catch (error: any) {
      throw new Error(`Failed to get unread count: ${error.message}`);
    }
  }
}