import { Router } from 'express';
import Joi from 'joi';
import { AuthUtils } from '@mentor-platform/shared';
import { VideoCallService } from '../services/videoCallService';
import { ConversationService } from '../services/conversationService';
import { asyncHandler, createError } from '../middleware/errorHandler';

const router = Router();
const videoCallService = new VideoCallService();
const conversationService = new ConversationService();

// Validation schemas
const initiateCallSchema = Joi.object({
  conversationId: Joi.string().uuid().required(),
  participantIds: Joi.array().items(Joi.string().uuid()).min(1).max(10).required(),
  metadata: Joi.object().optional()
});

const callActionSchema = Joi.object({
  reason: Joi.string().max(200).optional()
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
  const conversationId = req.body.conversationId || req.params.conversationId;
  
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

// Initiate a video call
router.post('/initiate', authenticate, asyncHandler(async (req: any, res: any) => {
  const { error, value } = initiateCallSchema.validate(req.body);
  if (error) {
    throw createError(error.details[0].message, 400);
  }

  const { conversationId, participantIds, metadata } = value;

  // Verify user has access to conversation
  const conversation = await conversationService.getConversation(conversationId);
  if (!conversation.participants.includes(req.user.userId)) {
    throw createError('Not authorized to initiate calls in this conversation', 403);
  }

  // Verify all participants are in the conversation
  const invalidParticipants = participantIds.filter((id: string) => !conversation.participants.includes(id));
  if (invalidParticipants.length > 0) {
    throw createError('Some participants are not in the conversation', 400);
  }

  const callSession = await videoCallService.initiateCall(
    conversationId,
    req.user.userId,
    participantIds,
    metadata
  );

  // Generate WebRTC configuration
  const webrtcConfig = videoCallService.generateWebRTCConfig();

  res.status(201).json({
    success: true,
    data: {
      callSession,
      webrtcConfig
    }
  });
}));

// Accept a video call
router.post('/:callId/accept', authenticate, asyncHandler(async (req: any, res: any) => {
  const callId = req.params.callId;

  const callSession = await videoCallService.acceptCall(callId, req.user.userId);
  const webrtcConfig = videoCallService.generateWebRTCConfig();

  res.json({
    success: true,
    data: {
      callSession,
      webrtcConfig
    }
  });
}));

// End or reject a video call
router.post('/:callId/end', authenticate, asyncHandler(async (req: any, res: any) => {
  const { error, value } = callActionSchema.validate(req.body);
  if (error) {
    throw createError(error.details[0].message, 400);
  }

  const callId = req.params.callId;
  const { reason } = value;

  const callSession = await videoCallService.endCall(callId, req.user.userId, reason);

  res.json({
    success: true,
    data: callSession
  });
}));

// Get call session details
router.get('/:callId', authenticate, asyncHandler(async (req: any, res: any) => {
  const callId = req.params.callId;

  const callSession = await videoCallService.getCallSession(callId);

  // Verify user has access to this call
  const allParticipants = [callSession.initiatorId, ...callSession.participantIds];
  if (!allParticipants.includes(req.user.userId)) {
    throw createError('Not authorized to access this call session', 403);
  }

  res.json({
    success: true,
    data: callSession
  });
}));

// Get user's call history
router.get('/history/user', authenticate, asyncHandler(async (req: any, res: any) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  if (limit > 100) {
    throw createError('Limit cannot exceed 100', 400);
  }

  const callHistory = await videoCallService.getUserCallHistory(req.user.userId, limit, offset);

  res.json({
    success: true,
    data: callHistory,
    pagination: {
      limit,
      offset,
      hasMore: callHistory.length === limit
    }
  });
}));

// Get WebRTC configuration
router.get('/config/webrtc', authenticate, asyncHandler(async (req: any, res: any) => {
  const webrtcConfig = videoCallService.generateWebRTCConfig();

  res.json({
    success: true,
    data: webrtcConfig
  });
}));

// Admin endpoint: Get active call sessions
router.get('/admin/active', authenticate, asyncHandler(async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN') {
    throw createError('Admin access required', 403);
  }

  const activeSessions = videoCallService.getActiveCallSessions();

  res.json({
    success: true,
    data: activeSessions
  });
}));

// Admin endpoint: Cleanup expired sessions
router.post('/admin/cleanup', authenticate, asyncHandler(async (req: any, res: any) => {
  if (req.user.role !== 'ADMIN') {
    throw createError('Admin access required', 403);
  }

  await videoCallService.cleanupExpiredSessions();

  res.json({
    success: true,
    message: 'Expired sessions cleaned up successfully'
  });
}));

export { router as videoCallRoutes };