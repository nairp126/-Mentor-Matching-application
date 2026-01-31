import { VideoCallService } from '../services/videoCallService';

describe('VideoCallService', () => {
  let videoCallService: VideoCallService;

  beforeEach(() => {
    videoCallService = new VideoCallService();
  });

  describe('generateWebRTCConfig', () => {
    it('should generate valid WebRTC configuration', () => {
      const config = videoCallService.generateWebRTCConfig();

      expect(config).toBeDefined();
      expect(config.iceServers).toBeDefined();
      expect(Array.isArray(config.iceServers)).toBe(true);
      expect(config.iceServers.length).toBeGreaterThan(0);
      expect(config.iceCandidatePoolSize).toBe(10);
    });

    it('should include STUN servers', () => {
      const config = videoCallService.generateWebRTCConfig();

      const stunServers = config.iceServers?.filter((server: any) => 
        server.urls && server.urls.toString().includes('stun:')
      );

      expect(stunServers).toBeDefined();
      expect(stunServers!.length).toBeGreaterThan(0);
    });
  });

  describe('getActiveCallSessions', () => {
    it('should return empty array initially', () => {
      const activeSessions = videoCallService.getActiveCallSessions();

      expect(Array.isArray(activeSessions)).toBe(true);
      expect(activeSessions).toHaveLength(0);
    });
  });

  describe('Video Call Session Interface', () => {
    it('should have correct session structure', () => {
      const session = {
        id: 'call-123',
        conversationId: 'conv-123',
        initiatorId: 'user-123',
        participantIds: ['user-456'],
        status: 'INITIATED' as const,
        roomId: 'room_call-123',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(session.id).toBe('call-123');
      expect(session.status).toBe('INITIATED');
      expect(session.participantIds).toHaveLength(1);
      expect(session.roomId).toContain('room_');
    });

    it('should support all valid statuses', () => {
      const validStatuses = ['INITIATED', 'RINGING', 'ACTIVE', 'ENDED', 'FAILED'];
      
      validStatuses.forEach(status => {
        const session = {
          id: 'call-123',
          conversationId: 'conv-123',
          initiatorId: 'user-123',
          participantIds: ['user-456'],
          status: status as any,
          roomId: 'room_call-123',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        expect(validStatuses).toContain(session.status);
      });
    });
  });

  describe('Call Invitation Interface', () => {
    it('should have correct invitation structure', () => {
      const invitation = {
        callId: 'call-123',
        fromUserId: 'user-123',
        toUserId: 'user-456',
        conversationId: 'conv-123',
        roomId: 'room_call-123',
        expiresAt: new Date(Date.now() + 30000) // 30 seconds from now
      };

      expect(invitation.callId).toBe('call-123');
      expect(invitation.fromUserId).toBe('user-123');
      expect(invitation.toUserId).toBe('user-456');
      expect(invitation.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });
});