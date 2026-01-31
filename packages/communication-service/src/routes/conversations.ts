import { Router } from 'express';
import Joi from 'joi';
import { AuthUtils } from '@mentor-platform/shared';
import { ConversationService } from '../services/conversationService';
import { asyncHandler, createError } from '../middleware/errorHandler';

const router = Router();
const conversationService = new ConversationService();

// Validation schemas
const createConversationSchema = Joi.object({
  participants: Joi.array().items(Joi.string().uuid()).min(2).max(10).required(),
  type: Joi.string().valid('DIRECT', 'GROUP', 'SESSION').default('DIRECT'),
  title: Joi.string().min(1).max(100).optional(),
  metadata: Joi.object().optional()
});

const updateConversationSchema = Joi.object({
  title: Joi.string().min(1).max(100).optional(),
  metadata: Joi.object().optional()
}).min(1);

const addParticipantSchema = Joi.object({
  userId: Joi.string().uuid().required()
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
  const conversationId = req.params.conversationId;
  
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

// Create a new conversation
router.post('/', authenticate, asyncHandler(async (req: any, res: any) => {
  const { error, value } = createConversationSchema.validate(req.body);
  if (error) {
    throw createError(error.details[0].message, 400);
  }

  const { participants, type, title, metadata } = value;

  // Ensure the requesting user is included in participants
  if (!participants.includes(req.user.userId)) {
    participants.push(req.user.userId);
  }

  const conversation = await conversationService.createConversation(
    participants,
    type,
    title,
    metadata
  );

  res.status(201).json({
    success: true,
    data: conversation
  });
}));

// Get user's conversations
router.get('/', authenticate, asyncHandler(async (req: any, res: any) => {
  const conversations = await conversationService.getUserConversations(req.user.userId);

  res.json({
    success: true,
    data: conversations
  });
}));

// Get a specific conversation
router.get('/:conversationId', authenticate, verifyConversationAccess, asyncHandler(async (req: any, res: any) => {
  res.json({
    success: true,
    data: req.conversation
  });
}));

// Update a conversation
router.put('/:conversationId', authenticate, verifyConversationAccess, asyncHandler(async (req: any, res: any) => {
  const { error, value } = updateConversationSchema.validate(req.body);
  if (error) {
    throw createError(error.details[0].message, 400);
  }

  // Only allow group conversations to be updated, or if user is admin
  if (req.conversation.type === 'DIRECT' && req.user.role !== 'ADMIN') {
    throw createError('Cannot update direct conversations', 400);
  }

  const conversationId = req.params.conversationId;
  const conversation = await conversationService.updateConversation(conversationId, value);

  res.json({
    success: true,
    data: conversation
  });
}));

// Add participant to conversation
router.post('/:conversationId/participants', authenticate, verifyConversationAccess, asyncHandler(async (req: any, res: any) => {
  const { error, value } = addParticipantSchema.validate(req.body);
  if (error) {
    throw createError(error.details[0].message, 400);
  }

  // Only allow group conversations to add participants
  if (req.conversation.type === 'DIRECT') {
    throw createError('Cannot add participants to direct conversations', 400);
  }

  const conversationId = req.params.conversationId;
  const { userId } = value;

  await conversationService.addParticipant(conversationId, userId);

  res.json({
    success: true,
    message: 'Participant added successfully'
  });
}));

// Remove participant from conversation
router.delete('/:conversationId/participants/:userId', authenticate, verifyConversationAccess, asyncHandler(async (req: any, res: any) => {
  const conversationId = req.params.conversationId;
  const userIdToRemove = req.params.userId;

  // Only allow group conversations to remove participants
  if (req.conversation.type === 'DIRECT') {
    throw createError('Cannot remove participants from direct conversations', 400);
  }

  // Users can only remove themselves, unless they're admin
  if (userIdToRemove !== req.user.userId && req.user.role !== 'ADMIN') {
    throw createError('Not authorized to remove this participant', 403);
  }

  await conversationService.removeParticipant(conversationId, userIdToRemove);

  res.json({
    success: true,
    message: 'Participant removed successfully'
  });
}));

// Find or create direct conversation between two users
router.post('/direct', authenticate, asyncHandler(async (req: any, res: any) => {
  const { error, value } = Joi.object({
    otherUserId: Joi.string().uuid().required()
  }).validate(req.body);

  if (error) {
    throw createError(error.details[0].message, 400);
  }

  const { otherUserId } = value;

  if (otherUserId === req.user.userId) {
    throw createError('Cannot create conversation with yourself', 400);
  }

  // Try to find existing direct conversation
  let conversation = await conversationService.findDirectConversation(req.user.userId, otherUserId);

  // If not found, create new one
  if (!conversation) {
    conversation = await conversationService.createConversation(
      [req.user.userId, otherUserId],
      'DIRECT'
    );
  }

  res.json({
    success: true,
    data: conversation
  });
}));

export { router as conversationRoutes };