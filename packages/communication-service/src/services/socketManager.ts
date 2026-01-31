import { Server as SocketIOServer, Socket } from 'socket.io';
import { AuthUtils } from '@mentor-platform/shared';
import { MessageService } from './messageService';
import { ConversationService } from './conversationService';
import { VideoCallService } from './videoCallService';

export interface SocketUser {
  userId: string;
  role: string;
  socketId: string;
  lastSeen: Date;
}

export interface MessageData {
  conversationId: string;
  content: string;
  type: 'TEXT' | 'FILE' | 'IMAGE' | 'SYSTEM';
  metadata?: Record<string, any>;
}

export interface TypingData {
  conversationId: string;
  isTyping: boolean;
}

export interface VideoCallData {
  callId: string;
  action: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave';
  data?: any;
}

export class SocketManager {
  private io: SocketIOServer;
  private messageService: MessageService;
  private conversationService: ConversationService;
  private videoCallService: VideoCallService;
  private connectedUsers: Map<string, SocketUser> = new Map();
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  constructor(
    io: SocketIOServer,
    messageService: MessageService,
    conversationService: ConversationService,
    videoCallService?: VideoCallService
  ) {
    this.io = io;
    this.messageService = messageService;
    this.conversationService = conversationService;
    this.videoCallService = videoCallService || new VideoCallService();
    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.io.use(this.authenticateSocket.bind(this));
    this.io.on('connection', this.handleConnection.bind(this));
  }

  private async authenticateSocket(socket: Socket, next: Function): Promise<void> {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const validation = AuthUtils.validateToken(token);
      if (!validation.valid) {
        return next(new Error('Invalid or expired token'));
      }

      // Attach user info to socket
      socket.data.user = {
        userId: validation.userId,
        role: validation.role
      };

      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  }

  private handleConnection(socket: Socket): void {
    const user = socket.data.user;
    console.log(`User ${user.userId} connected with socket ${socket.id}`);

    // Track connected user
    this.connectedUsers.set(socket.id, {
      userId: user.userId,
      role: user.role,
      socketId: socket.id,
      lastSeen: new Date()
    });

    // Track user's sockets (users can have multiple connections)
    if (!this.userSockets.has(user.userId)) {
      this.userSockets.set(user.userId, new Set());
    }
    this.userSockets.get(user.userId)!.add(socket.id);

    // Join user to their personal room for direct messaging
    socket.join(`user:${user.userId}`);

    // Set up event handlers
    socket.on('join_conversation', this.handleJoinConversation.bind(this, socket));
    socket.on('leave_conversation', this.handleLeaveConversation.bind(this, socket));
    socket.on('send_message', this.handleSendMessage.bind(this, socket));
    socket.on('typing_start', this.handleTypingStart.bind(this, socket));
    socket.on('typing_stop', this.handleTypingStop.bind(this, socket));
    socket.on('mark_as_read', this.handleMarkAsRead.bind(this, socket));
    socket.on('get_online_status', this.handleGetOnlineStatus.bind(this, socket));
    socket.on('video_call_signal', this.handleVideoCallSignal.bind(this, socket));
    socket.on('join_video_call', this.handleJoinVideoCall.bind(this, socket));
    socket.on('leave_video_call', this.handleLeaveVideoCall.bind(this, socket));
    socket.on('disconnect', this.handleDisconnection.bind(this, socket));

    // Emit user online status to relevant conversations
    this.broadcastUserStatus(user.userId, 'online');
  }

  private async handleJoinConversation(socket: Socket, data: { conversationId: string }): Promise<void> {
    try {
      const user = socket.data.user;
      const { conversationId } = data;

      // Verify user is participant in conversation
      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation.participants.includes(user.userId)) {
        socket.emit('error', { message: 'Not authorized to join this conversation' });
        return;
      }

      // Join conversation room
      socket.join(`conversation:${conversationId}`);
      
      // Notify other participants that user joined
      socket.to(`conversation:${conversationId}`).emit('user_joined_conversation', {
        conversationId,
        userId: user.userId,
        timestamp: new Date().toISOString()
      });

      socket.emit('joined_conversation', { conversationId });
    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  }

  private handleLeaveConversation(socket: Socket, data: { conversationId: string }): void {
    const user = socket.data.user;
    const { conversationId } = data;

    socket.leave(`conversation:${conversationId}`);
    
    // Notify other participants that user left
    socket.to(`conversation:${conversationId}`).emit('user_left_conversation', {
      conversationId,
      userId: user.userId,
      timestamp: new Date().toISOString()
    });

    socket.emit('left_conversation', { conversationId });
  }

  private async handleSendMessage(socket: Socket, data: MessageData): Promise<void> {
    try {
      const user = socket.data.user;
      const { conversationId, content, type, metadata } = data;

      // Verify user is participant in conversation
      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation.participants.includes(user.userId)) {
        socket.emit('error', { message: 'Not authorized to send messages to this conversation' });
        return;
      }

      // Save message to database
      const message = await this.messageService.sendMessage(
        conversationId,
        user.userId,
        content,
        type,
        metadata
      );

      // Broadcast message to all participants in the conversation
      this.io.to(`conversation:${conversationId}`).emit('new_message', {
        id: message.id,
        conversationId: message.conversationId,
        fromUserId: message.fromUserId,
        content: message.content,
        type: message.type,
        metadata: message.metadata,
        createdAt: message.createdAt,
        sender: {
          userId: user.userId,
          role: user.role
        }
      });

      // Send delivery confirmation to sender
      socket.emit('message_sent', {
        messageId: message.id,
        conversationId,
        timestamp: message.createdAt
      });

      // Update conversation's last message
      await this.conversationService.updateLastMessage(conversationId, message);

    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  }

  private async handleTypingStart(socket: Socket, data: TypingData): Promise<void> {
    try {
      const user = socket.data.user;
      const { conversationId } = data;

      // Verify user is participant in conversation
      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation.participants.includes(user.userId)) {
        return;
      }

      // Broadcast typing indicator to other participants
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        conversationId,
        userId: user.userId,
        isTyping: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      // Silently fail for typing indicators
    }
  }

  private async handleTypingStop(socket: Socket, data: TypingData): Promise<void> {
    try {
      const user = socket.data.user;
      const { conversationId } = data;

      // Verify user is participant in conversation
      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation.participants.includes(user.userId)) {
        return;
      }

      // Broadcast typing stop to other participants
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        conversationId,
        userId: user.userId,
        isTyping: false,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      // Silently fail for typing indicators
    }
  }

  private async handleMarkAsRead(socket: Socket, data: { messageId: string }): Promise<void> {
    try {
      const user = socket.data.user;
      const { messageId } = data;

      await this.messageService.markAsRead(messageId, user.userId);

      // Get message to find conversation
      const message = await this.messageService.getMessage(messageId);
      
      // Broadcast read receipt to conversation participants
      socket.to(`conversation:${message.conversationId}`).emit('message_read', {
        messageId,
        conversationId: message.conversationId,
        readBy: user.userId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  }

  private handleGetOnlineStatus(socket: Socket, data: { userIds: string[] }): void {
    const { userIds } = data;
    const onlineStatus: Record<string, boolean> = {};

    userIds.forEach(userId => {
      onlineStatus[userId] = this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
    });

    socket.emit('online_status', onlineStatus);
  }

  private handleDisconnection(socket: Socket): void {
    const user = this.connectedUsers.get(socket.id);
    if (!user) return;

    console.log(`User ${user.userId} disconnected from socket ${socket.id}`);

    // Remove from connected users
    this.connectedUsers.delete(socket.id);

    // Remove socket from user's socket set
    const userSocketSet = this.userSockets.get(user.userId);
    if (userSocketSet) {
      userSocketSet.delete(socket.id);
      
      // If user has no more connections, mark as offline
      if (userSocketSet.size === 0) {
        this.userSockets.delete(user.userId);
        this.broadcastUserStatus(user.userId, 'offline');
      }
    }
  }

  private async broadcastUserStatus(userId: string, status: 'online' | 'offline'): Promise<void> {
    try {
      // Get user's conversations to broadcast status to relevant participants
      const conversations = await this.conversationService.getUserConversations(userId);
      
      conversations.forEach(conversation => {
        this.io.to(`conversation:${conversation.id}`).emit('user_status_changed', {
          userId,
          status,
          timestamp: new Date().toISOString()
        });
      });
    } catch (error) {
      console.error('Error broadcasting user status:', error);
    }
  }

  private async handleVideoCallSignal(socket: Socket, data: VideoCallData): Promise<void> {
    try {
      const user = socket.data.user;
      const { callId, action, data: signalData } = data;

      // Verify user has access to this call
      const callSession = await this.videoCallService.getCallSession(callId);
      const allParticipants = [callSession.initiatorId, ...callSession.participantIds];
      
      if (!allParticipants.includes(user.userId)) {
        socket.emit('error', { message: 'Not authorized to access this call' });
        return;
      }

      // Broadcast signal to other participants in the call
      const callRoom = `call:${callId}`;
      socket.to(callRoom).emit('video_call_signal', {
        callId,
        action,
        data: signalData,
        fromUserId: user.userId
      });

      // Handle specific actions
      switch (action) {
        case 'offer':
          // Notify participants about incoming call
          this.notifyCallParticipants(callSession, 'call_incoming', {
            callId,
            initiatorId: callSession.initiatorId,
            roomId: callSession.roomId
          });
          break;
        
        case 'answer':
          // Update call status to active
          await this.videoCallService.updateCallStatus(callId, 'ACTIVE');
          break;
      }

    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  }

  private async handleJoinVideoCall(socket: Socket, data: { callId: string }): Promise<void> {
    try {
      const user = socket.data.user;
      const { callId } = data;

      // Verify user has access to this call
      const callSession = await this.videoCallService.getCallSession(callId);
      const allParticipants = [callSession.initiatorId, ...callSession.participantIds];
      
      if (!allParticipants.includes(user.userId)) {
        socket.emit('error', { message: 'Not authorized to join this call' });
        return;
      }

      // Join call room
      const callRoom = `call:${callId}`;
      socket.join(callRoom);

      // Notify other participants
      socket.to(callRoom).emit('user_joined_call', {
        callId,
        userId: user.userId,
        timestamp: new Date().toISOString()
      });

      socket.emit('joined_call', { 
        callId,
        callSession,
        webrtcConfig: this.videoCallService.generateWebRTCConfig()
      });

    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  }

  private async handleLeaveVideoCall(socket: Socket, data: { callId: string; reason?: string }): Promise<void> {
    try {
      const user = socket.data.user;
      const { callId, reason } = data;

      // Leave call room
      const callRoom = `call:${callId}`;
      socket.leave(callRoom);

      // Notify other participants
      socket.to(callRoom).emit('user_left_call', {
        callId,
        userId: user.userId,
        reason: reason || 'user_left',
        timestamp: new Date().toISOString()
      });

      socket.emit('left_call', { callId });

    } catch (error: any) {
      socket.emit('error', { message: error.message });
    }
  }

  private async notifyCallParticipants(
    callSession: any,
    eventType: string,
    data: any
  ): Promise<void> {
    const allParticipants = [callSession.initiatorId, ...callSession.participantIds];
    
    allParticipants.forEach(participantId => {
      this.io.to(`user:${participantId}`).emit(eventType, {
        ...data,
        timestamp: new Date().toISOString()
      });
    });
  }

  // Public methods for external use
  public async notifyCallStatusChange(
    callId: string,
    status: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const callSession = await this.videoCallService.getCallSession(callId);
      const allParticipants = [callSession.initiatorId, ...callSession.participantIds];
      
      const callRoom = `call:${callId}`;
      this.io.to(callRoom).emit('call_status_changed', {
        callId,
        status,
        metadata,
        timestamp: new Date().toISOString()
      });

      // Also notify user rooms for offline participants
      allParticipants.forEach(participantId => {
        this.io.to(`user:${participantId}`).emit('call_status_changed', {
          callId,
          status,
          metadata,
          timestamp: new Date().toISOString()
        });
      });
    } catch (error) {
      console.error('Error notifying call status change:', error);
    }
  }
  public async sendSystemMessage(conversationId: string, content: string, metadata?: Record<string, any>): Promise<void> {
    try {
      const message = await this.messageService.sendMessage(
        conversationId,
        'system',
        content,
        'SYSTEM',
        metadata
      );

      this.io.to(`conversation:${conversationId}`).emit('new_message', {
        id: message.id,
        conversationId: message.conversationId,
        fromUserId: 'system',
        content: message.content,
        type: message.type,
        metadata: message.metadata,
        createdAt: message.createdAt,
        sender: {
          userId: 'system',
          role: 'SYSTEM'
        }
      });
    } catch (error) {
      console.error('Error sending system message:', error);
    }
  }

  public getConnectedUsers(): SocketUser[] {
    return Array.from(this.connectedUsers.values());
  }

  public isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
  }

  public getConnectionCount(): number {
    return this.connectedUsers.size;
  }
}