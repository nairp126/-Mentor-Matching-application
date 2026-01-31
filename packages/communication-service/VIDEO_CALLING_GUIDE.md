# Video Calling Integration Guide

This guide explains how to integrate video calling functionality into the mentor matching platform.

## Overview

The video calling system uses WebRTC for peer-to-peer communication with Socket.IO for signaling. It supports:

- One-on-one video calls between mentors and students
- Group video calls for workshop sessions
- Call history and session tracking
- Real-time call status updates

## Architecture

```
Client A ←→ Socket.IO Server ←→ Client B
    ↓              ↓              ↓
WebRTC Peer Connection (Direct)
```

## API Endpoints

### Initiate a Call
```http
POST /api/video-calls/initiate
Authorization: Bearer <token>
Content-Type: application/json

{
  "conversationId": "uuid",
  "participantIds": ["user-uuid-1", "user-uuid-2"],
  "metadata": {
    "sessionType": "mentoring",
    "topic": "JavaScript fundamentals"
  }
}
```

### Accept a Call
```http
POST /api/video-calls/:callId/accept
Authorization: Bearer <token>
```

### End a Call
```http
POST /api/video-calls/:callId/end
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "session_completed"
}
```

### Get Call History
```http
GET /api/video-calls/history/user?limit=20&offset=0
Authorization: Bearer <token>
```

## Socket.IO Events

### Client → Server Events

#### Join Video Call
```javascript
socket.emit('join_video_call', {
  callId: 'call-uuid'
});
```

#### Leave Video Call
```javascript
socket.emit('leave_video_call', {
  callId: 'call-uuid',
  reason: 'user_left'
});
```

#### WebRTC Signaling
```javascript
socket.emit('video_call_signal', {
  callId: 'call-uuid',
  action: 'offer', // 'offer', 'answer', 'ice-candidate'
  data: {
    // WebRTC offer/answer/candidate data
  }
});
```

### Server → Client Events

#### Call Incoming
```javascript
socket.on('call_incoming', (data) => {
  console.log('Incoming call:', data);
  // {
  //   callId: 'call-uuid',
  //   initiatorId: 'user-uuid',
  //   roomId: 'room_call-uuid',
  //   timestamp: '2023-...'
  // }
});
```

#### User Joined Call
```javascript
socket.on('user_joined_call', (data) => {
  console.log('User joined:', data);
  // {
  //   callId: 'call-uuid',
  //   userId: 'user-uuid',
  //   timestamp: '2023-...'
  // }
});
```

#### Video Call Signal
```javascript
socket.on('video_call_signal', (data) => {
  console.log('WebRTC signal:', data);
  // {
  //   callId: 'call-uuid',
  //   action: 'offer',
  //   data: { /* WebRTC data */ },
  //   fromUserId: 'user-uuid'
  // }
});
```

## Client Implementation Example

### Basic Video Call Setup

```javascript
class VideoCallManager {
  constructor(socket, localVideoElement, remoteVideoElement) {
    this.socket = socket;
    this.localVideo = localVideoElement;
    this.remoteVideo = remoteVideoElement;
    this.peerConnection = null;
    this.localStream = null;
    this.currentCallId = null;
    
    this.setupSocketListeners();
  }

  setupSocketListeners() {
    this.socket.on('call_incoming', this.handleIncomingCall.bind(this));
    this.socket.on('video_call_signal', this.handleSignal.bind(this));
    this.socket.on('user_joined_call', this.handleUserJoined.bind(this));
    this.socket.on('user_left_call', this.handleUserLeft.bind(this));
  }

  async initiateCall(conversationId, participantIds) {
    try {
      // Get user media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      this.localVideo.srcObject = this.localStream;

      // Create call via API
      const response = await fetch('/api/video-calls/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`
        },
        body: JSON.stringify({
          conversationId,
          participantIds
        })
      });

      const result = await response.json();
      this.currentCallId = result.data.callSession.id;

      // Setup WebRTC
      await this.setupPeerConnection(result.data.webrtcConfig);
      
      // Join call room
      this.socket.emit('join_video_call', {
        callId: this.currentCallId
      });

      // Create and send offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      this.socket.emit('video_call_signal', {
        callId: this.currentCallId,
        action: 'offer',
        data: offer
      });

    } catch (error) {
      console.error('Failed to initiate call:', error);
    }
  }

  async acceptCall(callId) {
    try {
      this.currentCallId = callId;

      // Get user media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      this.localVideo.srcObject = this.localStream;

      // Accept call via API
      const response = await fetch(`/api/video-calls/${callId}/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.getToken()}`
        }
      });

      const result = await response.json();
      
      // Setup WebRTC
      await this.setupPeerConnection(result.data.webrtcConfig);
      
      // Join call room
      this.socket.emit('join_video_call', { callId });

    } catch (error) {
      console.error('Failed to accept call:', error);
    }
  }

  async setupPeerConnection(config) {
    this.peerConnection = new RTCPeerConnection(config);

    // Add local stream
    this.localStream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      this.remoteVideo.srcObject = event.streams[0];
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('video_call_signal', {
          callId: this.currentCallId,
          action: 'ice-candidate',
          data: event.candidate
        });
      }
    };
  }

  async handleSignal(data) {
    if (data.callId !== this.currentCallId) return;

    switch (data.action) {
      case 'offer':
        await this.peerConnection.setRemoteDescription(data.data);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        
        this.socket.emit('video_call_signal', {
          callId: this.currentCallId,
          action: 'answer',
          data: answer
        });
        break;

      case 'answer':
        await this.peerConnection.setRemoteDescription(data.data);
        break;

      case 'ice-candidate':
        await this.peerConnection.addIceCandidate(data.data);
        break;
    }
  }

  async endCall(reason = 'user_ended') {
    try {
      if (this.currentCallId) {
        // End call via API
        await fetch(`/api/video-calls/${this.currentCallId}/end`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getToken()}`
          },
          body: JSON.stringify({ reason })
        });

        // Leave call room
        this.socket.emit('leave_video_call', {
          callId: this.currentCallId,
          reason
        });
      }

      // Cleanup
      this.cleanup();

    } catch (error) {
      console.error('Failed to end call:', error);
    }
  }

  cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
    }

    this.localVideo.srcObject = null;
    this.remoteVideo.srcObject = null;
    this.currentCallId = null;
  }

  getToken() {
    // Return JWT token from storage
    return localStorage.getItem('authToken');
  }
}
```

### Usage Example

```javascript
// Initialize video call manager
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const socket = io('http://localhost:3005', {
  auth: {
    token: localStorage.getItem('authToken')
  }
});

const videoCallManager = new VideoCallManager(socket, localVideo, remoteVideo);

// Initiate a call
document.getElementById('callButton').addEventListener('click', () => {
  const conversationId = 'conversation-uuid';
  const participantIds = ['other-user-uuid'];
  videoCallManager.initiateCall(conversationId, participantIds);
});

// Accept incoming call
socket.on('call_incoming', (data) => {
  const accept = confirm(`Incoming call from user ${data.initiatorId}. Accept?`);
  if (accept) {
    videoCallManager.acceptCall(data.callId);
  }
});

// End call
document.getElementById('endCallButton').addEventListener('click', () => {
  videoCallManager.endCall('user_ended');
});
```

## Production Considerations

### TURN Servers
For production deployment, configure TURN servers for NAT traversal:

```javascript
// In VideoCallService.generateWebRTCConfig()
return {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD
    }
  ],
  iceCandidatePoolSize: 10
};
```

### Security
- Validate user permissions before allowing call access
- Implement rate limiting for call initiation
- Monitor and log call activities
- Use secure WebSocket connections (WSS)

### Scalability
- Consider using a media server (like Janus or Kurento) for group calls
- Implement call load balancing
- Use Redis for distributed socket management
- Monitor bandwidth and connection quality

### Error Handling
- Handle network disconnections gracefully
- Implement call reconnection logic
- Provide fallback options (audio-only mode)
- Log and monitor call failures

## Testing

Run the video call service tests:

```bash
npm test -- --testPathPattern=videoCallService.test.ts
```

The tests cover:
- WebRTC configuration generation
- Call session management
- Interface validation
- Basic service functionality

## Integration with Frontend

The video calling system integrates seamlessly with the existing conversation system. When users are in a conversation, they can initiate video calls that are tracked and managed through the same conversation context.

This provides a complete communication solution combining text messaging, file sharing, and video calling in a unified interface.