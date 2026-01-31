import request from 'supertest';
import { Server } from 'socket.io';
import { createServer } from 'http';
import Client from 'socket.io-client';
import app from '../index';
import { AuthUtils } from '@mentor-platform/shared';

// Mock the auth utils
jest.mock('@mentor-platform/shared', () => ({
  AuthUtils: {
    validateToken: jest.fn()
  },
  DatabaseUtils: {
    getPool: jest.fn(() => ({
      query: jest.fn(),
      connect: jest.fn(() => ({
        query: jest.fn(),
        release: jest.fn()
      }))
    }))
  }
}));

describe('Communication Service Integration', () => {
  let server: any;
  let clientSocket: any;
  let serverSocket: any;

  beforeAll((done) => {
    server = createServer(app);
    server.listen(() => {
      const port = server.address().port;
      
      // Mock successful authentication
      (AuthUtils.validateToken as jest.Mock).mockReturnValue({
        valid: true,
        userId: 'user-123',
        role: 'STUDENT'
      });

      clientSocket = Client(`http://localhost:${port}`, {
        auth: {
          token: 'valid-token'
        }
      });

      server.on('connection', (socket: any) => {
        serverSocket = socket;
      });

      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    server.close();
    clientSocket.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('REST API Endpoints', () => {
    describe('POST /api/conversations', () => {
      it('should create a new conversation', async () => {
        // Mock database responses
        const mockDb = require('@mentor-platform/shared').DatabaseUtils.getPool();
        const mockClient = {
          query: jest.fn(),
          release: jest.fn()
        };
        
        mockDb.connect.mockResolvedValue(mockClient);
        mockClient.query
          .mockResolvedValueOnce({ rows: [] }) // findDirectConversation
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ // INSERT conversation
            rows: [{
              id: 'conv-123',
              type: 'DIRECT',
              title: null,
              metadata: null,
              created_at: new Date(),
              updated_at: new Date()
            }]
          })
          .mockResolvedValueOnce({ rowCount: 1 }) // INSERT participant 1
          .mockResolvedValueOnce({ rowCount: 1 }) // INSERT participant 2
          .mockResolvedValueOnce({ rows: [] }); // COMMIT

        const response = await request(app)
          .post('/api/conversations')
          .set('Authorization', 'Bearer valid-token')
          .send({
            participants: ['user-456'],
            type: 'DIRECT'
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.id).toBe('conv-123');
      });

      it('should return 401 without valid token', async () => {
        const response = await request(app)
          .post('/api/conversations')
          .send({
            participants: ['user-456'],
            type: 'DIRECT'
          });

        expect(response.status).toBe(401);
      });

      it('should return 400 for invalid participants', async () => {
        const response = await request(app)
          .post('/api/conversations')
          .set('Authorization', 'Bearer valid-token')
          .send({
            participants: [], // Empty participants
            type: 'DIRECT'
          });

        expect(response.status).toBe(400);
      });
    });

    describe('GET /api/conversations', () => {
      it('should get user conversations', async () => {
        const mockDb = require('@mentor-platform/shared').DatabaseUtils.getPool();
        mockDb.query
          .mockResolvedValueOnce({ // Main conversations query
            rows: [{
              id: 'conv-123',
              type: 'DIRECT',
              title: null,
              metadata: null,
              created_at: new Date(),
              updated_at: new Date(),
              participants: ['user-123', 'user-456'],
              unread_count: '0',
              last_message_id: null,
              last_message_from: null,
              last_message_content: null,
              last_message_type: null,
              last_message_created_at: null
            }]
          })
          .mockResolvedValueOnce({ // Participant profiles query
            rows: [{
              user_id: 'user-456',
              first_name: 'John',
              last_name: 'Doe',
              role: 'MENTOR',
              profile_image_url: null
            }]
          });

        const response = await request(app)
          .get('/api/conversations')
          .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].id).toBe('conv-123');
      });
    });

    describe('POST /api/messages', () => {
      it('should send a message', async () => {
        const mockDb = require('@mentor-platform/shared').DatabaseUtils.getPool();
        mockDb.query
          .mockResolvedValueOnce({ // getConversation
            rows: [{
              id: 'conv-123',
              type: 'DIRECT',
              title: null,
              metadata: null,
              created_at: new Date(),
              updated_at: new Date(),
              participants: ['user-123', 'user-456']
            }]
          })
          .mockResolvedValueOnce({ // sendMessage
            rows: [{
              id: 'msg-123',
              conversation_id: 'conv-123',
              from_user_id: 'user-123',
              content: 'Hello world',
              type: 'TEXT',
              metadata: null,
              created_at: new Date(),
              edited_at: null
            }]
          });

        const response = await request(app)
          .post('/api/messages')
          .set('Authorization', 'Bearer valid-token')
          .send({
            conversationId: 'conv-123',
            content: 'Hello world',
            type: 'TEXT'
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.content).toBe('Hello world');
      });

      it('should return 403 for unauthorized conversation access', async () => {
        const mockDb = require('@mentor-platform/shared').DatabaseUtils.getPool();
        mockDb.query.mockResolvedValueOnce({ // getConversation
          rows: [{
            id: 'conv-123',
            type: 'DIRECT',
            title: null,
            metadata: null,
            created_at: new Date(),
            updated_at: new Date(),
            participants: ['user-456', 'user-789'] // user-123 not in participants
          }]
        });

        const response = await request(app)
          .post('/api/messages')
          .set('Authorization', 'Bearer valid-token')
          .send({
            conversationId: 'conv-123',
            content: 'Hello world',
            type: 'TEXT'
          });

        expect(response.status).toBe(403);
      });
    });
  });

  describe('WebSocket Communication', () => {
    it('should handle socket connection with authentication', (done) => {
      expect(clientSocket.connected).toBe(true);
      done();
    });

    it('should handle join conversation event', (done) => {
      const mockDb = require('@mentor-platform/shared').DatabaseUtils.getPool();
      mockDb.query.mockResolvedValueOnce({ // getConversation
        rows: [{
          id: 'conv-123',
          type: 'DIRECT',
          title: null,
          metadata: null,
          created_at: new Date(),
          updated_at: new Date(),
          participants: ['user-123', 'user-456']
        }]
      });

      clientSocket.emit('join_conversation', { conversationId: 'conv-123' });

      clientSocket.on('joined_conversation', (data: any) => {
        expect(data.conversationId).toBe('conv-123');
        done();
      });
    });

    it('should handle send message event', (done) => {
      const mockDb = require('@mentor-platform/shared').DatabaseUtils.getPool();
      mockDb.query
        .mockResolvedValueOnce({ // getConversation
          rows: [{
            id: 'conv-123',
            type: 'DIRECT',
            title: null,
            metadata: null,
            created_at: new Date(),
            updated_at: new Date(),
            participants: ['user-123', 'user-456']
          }]
        })
        .mockResolvedValueOnce({ // sendMessage
          rows: [{
            id: 'msg-123',
            conversation_id: 'conv-123',
            from_user_id: 'user-123',
            content: 'Hello via socket',
            type: 'TEXT',
            metadata: null,
            created_at: new Date(),
            edited_at: null
          }]
        })
        .mockResolvedValueOnce({ rowCount: 1 }); // updateLastMessage

      clientSocket.emit('send_message', {
        conversationId: 'conv-123',
        content: 'Hello via socket',
        type: 'TEXT'
      });

      clientSocket.on('message_sent', (data: any) => {
        expect(data.messageId).toBe('msg-123');
        expect(data.conversationId).toBe('conv-123');
        done();
      });
    });

    it('should handle typing events', (done) => {
      const mockDb = require('@mentor-platform/shared').DatabaseUtils.getPool();
      mockDb.query.mockResolvedValue({ // getConversation
        rows: [{
          id: 'conv-123',
          type: 'DIRECT',
          title: null,
          metadata: null,
          created_at: new Date(),
          updated_at: new Date(),
          participants: ['user-123', 'user-456']
        }]
      });

      clientSocket.emit('typing_start', {
        conversationId: 'conv-123',
        isTyping: true
      });

      // Since we're the sender, we won't receive our own typing event
      // This test mainly ensures no errors occur
      setTimeout(() => {
        done();
      }, 100);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid authentication token', async () => {
      (AuthUtils.validateToken as jest.Mock).mockReturnValue({
        valid: false
      });

      const response = await request(app)
        .get('/api/conversations')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    it('should handle database connection errors', async () => {
      const mockDb = require('@mentor-platform/shared').DatabaseUtils.getPool();
      mockDb.query.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/conversations')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(500);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('communication-service');
    });
  });
});