import { io, Socket } from 'socket.io-client'
import { store } from '@/store'
import {
  addMessage,
  setOnlineUsers,
  addOnlineUser,
  removeOnlineUser,
  setTypingUsers,
  setVideoCall,
  updateVideoCallStatus
} from '@/store/slices/communicationSlice'
import { addNotification } from '@/store/slices/notificationSlice'

class SocketService {
  private socket: Socket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  connect(token: string): void {
    if (this.socket?.connected) {
      return
    }

    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8080'
    this.socket = io(socketUrl, {
      auth: {
        token
      },
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    })

    this.setupEventListeners()
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.reconnectAttempts = 0
  }

  private setupEventListeners(): void {
    if (!this.socket) return

    // Connection events
    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id)
      this.reconnectAttempts = 0
    })

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason)
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, don't reconnect
        return
      }
      this.handleReconnect()
    })

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
      this.handleReconnect()
    })

    // Message events
    this.socket.on('message:new', (message) => {
      store.dispatch(addMessage(message))
    })

    this.socket.on('message:read', ({ messageId, userId }) => {
      // Handle message read status update
      console.log(`Message ${messageId} read by ${userId}`)
    })

    // Typing events
    this.socket.on('typing:start', ({ conversationId, userId }) => {
      const currentTyping = store.getState().communication.typingUsers[conversationId] || []
      if (!currentTyping.includes(userId)) {
        store.dispatch(setTypingUsers({
          conversationId,
          users: [...currentTyping, userId]
        }))
      }
    })

    this.socket.on('typing:stop', ({ conversationId, userId }) => {
      const currentTyping = store.getState().communication.typingUsers[conversationId] || []
      store.dispatch(setTypingUsers({
        conversationId,
        users: currentTyping.filter(id => id !== userId)
      }))
    })

    // User presence events
    this.socket.on('user:online', (userId) => {
      store.dispatch(addOnlineUser(userId))
    })

    this.socket.on('user:offline', (userId) => {
      store.dispatch(removeOnlineUser(userId))
    })

    this.socket.on('users:online', (userIds) => {
      store.dispatch(setOnlineUsers(userIds))
    })

    // Video call events
    this.socket.on('call:initiated', (callSession) => {
      store.dispatch(setVideoCall(callSession))
    })

    this.socket.on('call:accepted', ({ callId }) => {
      store.dispatch(updateVideoCallStatus({ callId, status: 'ACTIVE' }))
    })

    this.socket.on('call:declined', ({ callId }) => {
      store.dispatch(updateVideoCallStatus({ callId, status: 'DECLINED' }))
    })

    this.socket.on('call:ended', ({ callId }) => {
      store.dispatch(updateVideoCallStatus({ callId, status: 'ENDED' }))
    })

    // Notification events
    this.socket.on('notification:new', (notification) => {
      store.dispatch(addNotification(notification))
    })

    // Session events
    this.socket.on('session:updated', (session) => {
      // Handle session updates
      console.log('Session updated:', session)
    })

    this.socket.on('session:cancelled', ({ sessionId }) => {
      // Handle session cancellation
      console.log('Session cancelled:', sessionId)
    })

    this.socket.on('session:reminder', ({ sessionId, minutesUntil }) => {
      // Handle session reminders
      console.log(`Session ${sessionId} starts in ${minutesUntil} minutes`)
    })
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    setTimeout(() => {
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      this.socket?.connect()
    }, delay)
  }

  // Message methods
  sendMessage(conversationId: string, content: string, type = 'TEXT'): void {
    this.socket?.emit('message:send', { conversationId, content, type })
  }

  markMessageAsRead(messageId: string): void {
    this.socket?.emit('message:read', { messageId })
  }

  // Typing methods
  startTyping(conversationId: string): void {
    this.socket?.emit('typing:start', { conversationId })
  }

  stopTyping(conversationId: string): void {
    this.socket?.emit('typing:stop', { conversationId })
  }

  // Video call methods
  initiateCall(participantId: string): void {
    this.socket?.emit('call:initiate', { participantId })
  }

  acceptCall(callId: string): void {
    this.socket?.emit('call:accept', { callId })
  }

  declineCall(callId: string): void {
    this.socket?.emit('call:decline', { callId })
  }

  endCall(callId: string): void {
    this.socket?.emit('call:end', { callId })
  }

  // WebRTC signaling
  sendSignal(callId: string, signal: any): void {
    this.socket?.emit('webrtc:signal', { callId, signal })
  }

  // Room management
  joinRoom(roomId: string): void {
    this.socket?.emit('room:join', { roomId })
  }

  leaveRoom(roomId: string): void {
    this.socket?.emit('room:leave', { roomId })
  }

  // Utility methods
  isConnected(): boolean {
    return this.socket?.connected || false
  }

  getSocketId(): string | undefined {
    return this.socket?.id
  }

  // Custom event emitter
  emit(event: string, data: any): void {
    this.socket?.emit(event, data)
  }

  on(event: string, callback: (data: any) => void): void {
    this.socket?.on(event, callback)
  }

  off(event: string, callback?: (data: any) => void): void {
    this.socket?.off(event, callback)
  }
}

export const socketService = new SocketService()
export default socketService