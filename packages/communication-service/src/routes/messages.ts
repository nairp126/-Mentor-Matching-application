import { Router } from 'express';
import Joi from 'joi';
import { AuthUtils } from '@mentor-platform/shared';
import { MessageService } from '../services/messageService';
import { ConversationService } from '../services/conversationService';
import { asyncHandler, createError } from '../middleware/errorHandler';

const router = Router();
const messageService = new MessageService();
const conversationService = new ConversationService();

// Validation schemas
const sendMessageSchema = Joi.object({
  conversationId: Joi.string().uuid().required(),
  content: Joi.string().min(1).max(5000).required(),
  type: Joi.string().valid('TEXT', 'FILE', 'IMAGE').default('TEXT'),
  metadata: Joi.object().optional()
});

const editMessageSchema = Joi.object({
  content: Joi.string().min(1).max(5000).required()
});

const searchMessagesSchema = Joi.object({
  conversationId: Joi.string().uuid().required(),
  query: Joi.string().min(1).max(100).required(),
  limit: Joi.number().integer().min(1).max(100).default(50)
});

// Middleware to authenticate requests
const authenticate = asyncHandler(async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    throw createError('Authentication token required', 401);
  }

  const validation = AuthUtils.validateToken(token);
  if (!validation.valid) {
    throw createError('Invalid or expired token', 401);
  }

  req.user = {
    userId: validation.userId,
    role: validation.role
  };

  next();
});

// Middleware to verify conversation access
const verifyConversationAccess = asyncHandler(async (req: any, res: any, next: any) => {
  const conversationId = req.params.conversationId || req.body.conversationId;
  
  if (!conversationId) {
    throw createError('Conversation ID required', 400);
  }

  try {
    const conversation = await conversationService.getConversation(conversationId);
    
    if (!conversation.participants.includes(req.user.userId)) {
      throw createError('Not authorized to access this conversation', 403);
    }

    req.conversation = conversation;
    next();
  } catch (error: any) {
    if (error.message === 'Conversation not found') {
      throw createError('Conversation not found', 404);
    }
    throw error;
  }
});

// Send a message
router.post('/', authenticate, asyncHandler(async (req: any, res: any) => {
  const { error, value } = sendMessageSchema.validate(req.body);
  if (error) {
    throw createError(error.details[0].message, 400);
  }

  const { conversationId, content, type, metadata } = value;

  // Verify user has access to conversation
  const conversation = await conversationService.getConversation(conversationId);
  if (!conversation.participants.includes(req.user.userId)) {
    throw createError('Not authorized to send messages to this conversation', 403);
  }

  const message = await messageService.sendMessage(
    conversationId,
    req.user.userId,
    content,
    type,
    metadata
  );

  res.status(201).json({
    success: true,
    data: message
  });
}));

// Get messages for a conversation
router.get('/conversation/:conversationId', authenticate, verifyConversationAccess, asyncHandler(async (req: any, res: any) => {
  const conversationId = req.params.conversationId;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  if (limit > 100) {
    throw createError('Limit cannot exceed 100', 400);
  }

  const messages = await messageService.getMessages({
    conversationId,
    limit,
    offset
  });

  res.json({
    success: true,
    data: messages,
    pagination: {
      limit,
      offset,
      hasMore: messages.length === limit
    }
  });
}));

// Get a specific message
router.get('/:messageId', authenticate, asyncHandler(async (req: any, res: any) => {
  const messageId = req.params.messageId;

  const message = await messageService.getMessage(messageId);

  // Verify user has access to the conversation
  const conversation = await conversationService.getConversation(message.conversationId);
  if (!conversation.participants.includes(req.user.userId)) {
    throw createError('Not authorized to access this message', 403);
  }

  res.json({
    success: true,
    data: message
  });
}));

// Edit a message
router.put('/:messageId', authenticate, asyncHandler(async (req: any, res: any) => {
  const { error, value } = editMessageSchema.validate(req.body);
  if (error) {
    throw createError(error.details[0].message, 400);
  }

  const messageId = req.params.messageId;
  const { content } = value;

  const message = await messageService.editMessage(messageId, req.user.userId, content);

  res.json({
    success: true,
    data: message
  });
}));

// Delete a message
router.delete('/:messageId', authenticate, asyncHandler(async (req: any, res: any) => {
  const messageId = req.params.messageId;

  await messageService.deleteMessage(messageId, req.user.userId);

  res.json({
    success: true,
    message: 'Message deleted successfully'
  });
}));

// Mark message as read
router.post('/:messageId/read', authenticate, asyncHandler(async (req: any, res: any) => {
  const messageId = req.params.messageId;

  // Verify user has access to the message
  const message = await messageService.getMessage(messageId);
  const conversation = await conversationService.getConversation(message.conversationId);
  
  if (!conversation.participants.includes(req.user.userId)) {
    throw createError('Not authorized to mark this message as read', 403);
  }

  await messageService.markAsRead(messageId, req.user.userId);

  res.json({
    success: true,
    message: 'Message marked as read'
  });
}));

// Search messages in a conversation
router.post('/search', authenticate, asyncHandler(async (req: any, res: any) => {
  const { error, value } = searchMessagesSchema.validate(req.body);
  if (error) {
    throw createError(error.details[0].message, 400);
  }

  const { conversationId, query, limit } = value;

  // Verify user has access to conversation
  const conversation = await conversationService.getConversation(conversationId);
  if (!conversation.participants.includes(req.user.userId)) {
    throw createError('Not authorized to search messages in this conversation', 403);
  }

  const messages = await messageService.searchMessages(conversationId, query, limit);

  res.json({
    success: true,
    data: messages,
    query: query
  });
}));

// Get unread message count
router.get('/unread/count', authenticate, asyncHandler(async (req: any, res: any) => {
  const conversationId = req.query.conversationId as string;

  const unreadCount = await messageService.getUnreadCount(req.user.userId, conversationId);

  res.json({
    success: true,
    data: {
      unreadCount,
      conversationId: conversationId || null
    }
  });
}));

export { router as messageRoutes };