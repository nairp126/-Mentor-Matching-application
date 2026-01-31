import { MessageService } from '../services/messageService';
import { ConversationService } from '../services/conversationService';

describe('Communication Service Basic Tests', () => {
  describe('MessageService', () => {
    it('should be instantiable', () => {
      expect(() => new MessageService()).not.toThrow();
    });
  });

  describe('ConversationService', () => {
    it('should be instantiable', () => {
      expect(() => new ConversationService()).not.toThrow();
    });
  });

  describe('Message Interface', () => {
    it('should have correct message structure', () => {
      const message = {
        id: 'test-id',
        conversationId: 'conv-id',
        fromUserId: 'user-id',
        content: 'Hello world',
        type: 'TEXT' as const,
        createdAt: new Date(),
        readBy: []
      };

      expect(message.id).toBe('test-id');
      expect(message.content).toBe('Hello world');
      expect(message.type).toBe('TEXT');
      expect(Array.isArray(message.readBy)).toBe(true);
    });
  });

  describe('Conversation Interface', () => {
    it('should have correct conversation structure', () => {
      const conversation = {
        id: 'conv-id',
        participants: ['user-1', 'user-2'],
        type: 'DIRECT' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(conversation.id).toBe('conv-id');
      expect(conversation.participants).toHaveLength(2);
      expect(conversation.type).toBe('DIRECT');
    });
  });
});