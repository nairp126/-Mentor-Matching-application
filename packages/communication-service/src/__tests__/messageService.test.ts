import { MessageService } from '../services/messageService';

// Mock the database
const mockDb = {
  query: jest.fn(),
  connect: jest.fn(),
  release: jest.fn()
};

// Mock the DatabaseManager
jest.mock('@mentor-platform/shared', () => ({
  DatabaseManager: jest.fn().mockImplementation(() => mockDb)
}));

describe('MessageService', () => {
  let messageService: MessageService;

  beforeEach(() => {
    messageService = new MessageService();
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should send a text message successfully', async () => {
      const mockMessage = {
        id: 'message-123',
        conversation_id: 'conv-123',
        from_user_id: 'user-123',
        content: 'Hello world',
        type: 'TEXT',
        metadata: null,
        created_at: new Date(),
        edited_at: null
      };

      mockDb.query.mockResolvedValue({ rows: [mockMessage] });

      const result = await messageService.sendMessage(
        'conv-123',
        'user-123',
        'Hello world',
        'TEXT'
      );

      expect(result).toEqual({
        id: mockMessage.id,
        conversationId: mockMessage.conversation_id,
        fromUserId: mockMessage.from_user_id,
        content: mockMessage.content,
        type: mockMessage.type,
        metadata: undefined,
        createdAt: mockMessage.created_at,
        editedAt: mockMessage.edited_at,
        readBy: []
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO messages'),
        expect.arrayContaining(['conv-123', 'user-123', 'Hello world', 'TEXT'])
      );
    });

    it('should send a message with metadata', async () => {
      const metadata = { fileName: 'test.pdf', fileSize: 1024 };
      const mockMessage = {
        id: 'message-123',
        conversation_id: 'conv-123',
        from_user_id: 'user-123',
        content: 'File uploaded',
        type: 'FILE',
        metadata: JSON.stringify(metadata),
        created_at: new Date(),
        edited_at: null
      };

      mockDb.query.mockResolvedValue({ rows: [mockMessage] });

      const result = await messageService.sendMessage(
        'conv-123',
        'user-123',
        'File uploaded',
        'FILE',
        metadata
      );

      expect(result.metadata).toEqual(metadata);
    });

    it('should handle database errors', async () => {
      mockDb.query.mockRejectedValue(new Error('Database error'));

      await expect(
        messageService.sendMessage('conv-123', 'user-123', 'Hello world')
      ).rejects.toThrow('Failed to send message: Database error');
    });
  });

  describe('getMessage', () => {
    it('should retrieve a message with read status', async () => {
      const mockMessage = {
        id: 'message-123',
        conversation_id: 'conv-123',
        from_user_id: 'user-123',
        content: 'Hello world',
        type: 'TEXT',
        metadata: null,
        created_at: new Date(),
        edited_at: null,
        read_by: ['user-456']
      };

      mockDb.query.mockResolvedValue({ rows: [mockMessage] });

      const result = await messageService.getMessage('message-123');

      expect(result.readBy).toEqual(['user-456']);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT m.*'),
        ['message-123']
      );
    });

    it('should throw error when message not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await expect(
        messageService.getMessage('nonexistent-id')
      ).rejects.toThrow('Failed to get message: Message not found');
    });
  });

  describe('markAsRead', () => {
    it('should mark message as read', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 1 });

      await messageService.markAsRead('message-123', 'user-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO message_reads'),
        expect.arrayContaining(['message-123', 'user-123'])
      );
    });

    it('should handle database errors', async () => {
      mockDb.query.mockRejectedValue(new Error('Database error'));

      await expect(
        messageService.markAsRead('message-123', 'user-123')
      ).rejects.toThrow('Failed to mark message as read: Database error');
    });
  });

  describe('searchMessages', () => {
    it('should search messages in conversation', async () => {
      const mockMessages = [
        {
          id: 'message-123',
          conversation_id: 'conv-123',
          from_user_id: 'user-123',
          content: 'Hello world',
          type: 'TEXT',
          metadata: null,
          created_at: new Date(),
          edited_at: null,
          read_by: []
        }
      ];

      mockDb.query.mockResolvedValue({ rows: mockMessages });

      const result = await messageService.searchMessages('conv-123', 'hello', 10);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Hello world');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.conversation_id = $1'),
        ['conv-123', '%hello%', 10]
      );
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread message count for user', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ unread_count: '5' }] });

      const count = await messageService.getUnreadCount('user-123');

      expect(count).toBe(5);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) as unread_count'),
        ['user-123']
      );
    });

    it('should return unread count for specific conversation', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ unread_count: '2' }] });

      const count = await messageService.getUnreadCount('user-123', 'conv-123');

      expect(count).toBe(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('AND m.conversation_id = $2'),
        ['user-123', 'conv-123']
      );
    });
  });
});