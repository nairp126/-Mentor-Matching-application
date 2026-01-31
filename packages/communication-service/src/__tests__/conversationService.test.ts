import { ConversationService } from '../services/conversationService';
import { DatabaseUtils } from '@mentor-platform/shared';

// Mock the database
jest.mock('@mentor-platform/shared', () => ({
  DatabaseUtils: {
    getPool: jest.fn()
  }
}));

describe('ConversationService', () => {
  let conversationService: ConversationService;
  let mockDb: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    mockDb = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient)
    };
    
    (DatabaseUtils.getPool as jest.Mock).mockReturnValue(mockDb);
    conversationService = new ConversationService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createConversation', () => {
    it('should create a direct conversation successfully', async () => {
      const mockConversation = {
        id: 'conv-123',
        type: 'DIRECT',
        title: null,
        metadata: null,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockConversation] }) // INSERT conversation
        .mockResolvedValueOnce({ rowCount: 1 }) // INSERT participant 1
        .mockResolvedValueOnce({ rowCount: 1 }); // INSERT participant 2

      const result = await conversationService.createConversation(
        ['user-123', 'user-456'],
        'DIRECT'
      );

      expect(result).toEqual({
        id: mockConversation.id,
        participants: ['user-123', 'user-456'],
        type: mockConversation.type,
        title: mockConversation.title,
        metadata: undefined,
        createdAt: mockConversation.created_at,
        updatedAt: mockConversation.updated_at
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should return existing direct conversation if found', async () => {
      const existingConversation = {
        id: 'existing-conv',
        participants: ['user-123', 'user-456'],
        type: 'DIRECT',
        title: null,
        metadata: null,
        created_at: new Date(),
        updated_at: new Date()
      };

      // Mock findDirectConversation to return existing conversation
      mockDb.query.mockResolvedValue({ rows: [existingConversation] });

      const result = await conversationService.createConversation(
        ['user-123', 'user-456'],
        'DIRECT'
      );

      expect(result.id).toBe('existing-conv');
      // Should not create new conversation
      expect(mockClient.query).not.toHaveBeenCalledWith('BEGIN');
    });

    it('should throw error for insufficient participants', async () => {
      await expect(
        conversationService.createConversation(['user-123'])
      ).rejects.toThrow('Conversation must have at least 2 participants');
    });

    it('should handle database transaction errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Database error'));

      await expect(
        conversationService.createConversation(['user-123', 'user-456'])
      ).rejects.toThrow('Failed to create conversation: Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getConversation', () => {
    it('should retrieve conversation with participants and last message', async () => {
      const mockConversation = {
        id: 'conv-123',
        type: 'DIRECT',
        title: null,
        metadata: null,
        created_at: new Date(),
        updated_at: new Date(),
        participants: ['user-123', 'user-456'],
        last_message_id: 'msg-123',
        last_message_from: 'user-123',
        last_message_content: 'Hello',
        last_message_type: 'TEXT',
        last_message_created_at: new Date()
      };

      mockDb.query.mockResolvedValue({ rows: [mockConversation] });

      const result = await conversationService.getConversation('conv-123');

      expect(result.id).toBe('conv-123');
      expect(result.participants).toEqual(['user-123', 'user-456']);
      expect(result.lastMessage).toBeDefined();
      expect(result.lastMessage?.content).toBe('Hello');
    });

    it('should throw error when conversation not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await expect(
        conversationService.getConversation('nonexistent-id')
      ).rejects.toThrow('Failed to get conversation: Conversation not found');
    });
  });

  describe('getUserConversations', () => {
    it('should retrieve user conversations with details', async () => {
      const mockConversations = [
        {
          id: 'conv-123',
          type: 'DIRECT',
          title: null,
          metadata: null,
          created_at: new Date(),
          updated_at: new Date(),
          participants: ['user-123', 'user-456'],
          unread_count: '2',
          last_message_id: null,
          last_message_from: null,
          last_message_content: null,
          last_message_type: null,
          last_message_created_at: null
        }
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockConversations }) // Main query
        .mockResolvedValueOnce({ rows: [ // Participant profiles
          {
            user_id: 'user-456',
            first_name: 'John',
            last_name: 'Doe',
            role: 'MENTOR',
            profile_image_url: null
          }
        ]});

      const result = await conversationService.getUserConversations('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].unreadCount).toBe(2);
      expect(result[0].participantProfiles).toHaveLength(1);
      expect(result[0].participantProfiles[0].firstName).toBe('John');
    });
  });

  describe('findDirectConversation', () => {
    it('should find existing direct conversation between two users', async () => {
      const mockConversation = {
        id: 'conv-123',
        type: 'DIRECT',
        title: null,
        metadata: null,
        created_at: new Date(),
        updated_at: new Date(),
        participants: ['user-123', 'user-456']
      };

      mockDb.query.mockResolvedValue({ rows: [mockConversation] });

      const result = await conversationService.findDirectConversation('user-123', 'user-456');

      expect(result).toBeDefined();
      expect(result?.id).toBe('conv-123');
      expect(result?.participants).toEqual(['user-123', 'user-456']);
    });

    it('should return null when no direct conversation exists', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await conversationService.findDirectConversation('user-123', 'user-456');

      expect(result).toBeNull();
    });
  });

  describe('addParticipant', () => {
    it('should add participant to conversation', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 1 });

      await conversationService.addParticipant('conv-123', 'user-789');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO conversation_participants'),
        expect.arrayContaining(['conv-123', 'user-789'])
      );
    });

    it('should handle database errors', async () => {
      mockDb.query.mockRejectedValue(new Error('Database error'));

      await expect(
        conversationService.addParticipant('conv-123', 'user-789')
      ).rejects.toThrow('Failed to add participant: Database error');
    });
  });

  describe('removeParticipant', () => {
    it('should remove participant from conversation', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 1 });

      await conversationService.removeParticipant('conv-123', 'user-789');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM conversation_participants'),
        ['conv-123', 'user-789']
      );
    });
  });

  describe('updateLastMessage', () => {
    it('should update conversation timestamp', async () => {
      const message = {
        id: 'msg-123',
        conversationId: 'conv-123',
        fromUserId: 'user-123',
        content: 'Hello',
        type: 'TEXT' as const,
        createdAt: new Date(),
        readBy: []
      };

      mockDb.query.mockResolvedValue({ rowCount: 1 });

      await conversationService.updateLastMessage('conv-123', message);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE conversations'),
        [message.createdAt, 'conv-123']
      );
    });
  });
});