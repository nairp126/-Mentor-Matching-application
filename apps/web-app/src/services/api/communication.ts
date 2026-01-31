import { apiClient } from './index'
import { 
  Conversation, 
  Message, 
  VideoCallSession,
  PaginatedResponse 
} from '@/types'

export const communicationApi = {
  // Conversations
  getConversations: (): Promise<Conversation[]> =>
    apiClient.get('/conversations'),

  getConversation: (conversationId: string): Promise<Conversation> =>
    apiClient.get(`/conversations/${conversationId}`),

  createConversation: (participantId: string): Promise<Conversation> =>
    apiClient.post('/conversations', { participantId }),

  deleteConversation: (conversationId: string): Promise<{ message: string }> =>
    apiClient.delete(`/conversations/${conversationId}`),

  // Messages
  getMessages: (conversationId: string, page = 1, limit = 50): Promise<PaginatedResponse<Message>> =>
    apiClient.get(`/conversations/${conversationId}/messages`, { 
      params: { page, limit } 
    }),

  sendMessage: (conversationId: string, content: string, type = 'TEXT'): Promise<Message> =>
    apiClient.post(`/conversations/${conversationId}/messages`, { 
      content, 
      type 
    }),

  editMessage: (messageId: string, content: string): Promise<Message> =>
    apiClient.put(`/messages/${messageId}`, { content }),

  deleteMessage: (messageId: string): Promise<{ message: string }> =>
    apiClient.delete(`/messages/${messageId}`),

  markAsRead: (messageId: string): Promise<{ message: string }> =>
    apiClient.post(`/messages/${messageId}/read`),

  markConversationAsRead: (conversationId: string): Promise<{ message: string }> =>
    apiClient.post(`/conversations/${conversationId}/read`),

  // File sharing
  uploadFile: (conversationId: string, file: File): Promise<Message> => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post(`/conversations/${conversationId}/files`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  downloadFile: (fileId: string): Promise<Blob> =>
    apiClient.get(`/files/${fileId}/download`, { 
      responseType: 'blob' 
    }),

  // Message search
  searchMessages: (query: string, conversationId?: string): Promise<Message[]> =>
    apiClient.get('/messages/search', { 
      params: { q: query, conversationId } 
    }),

  // Video calls
  initiateVideoCall: (participantId: string): Promise<VideoCallSession> =>
    apiClient.post('/video-calls/initiate', { participantId }),

  acceptVideoCall: (callId: string): Promise<VideoCallSession> =>
    apiClient.post(`/video-calls/${callId}/accept`),

  declineVideoCall: (callId: string): Promise<{ message: string }> =>
    apiClient.post(`/video-calls/${callId}/decline`),

  endVideoCall: (callId: string): Promise<VideoCallSession> =>
    apiClient.post(`/video-calls/${callId}/end`),

  getVideoCallHistory: (): Promise<VideoCallSession[]> =>
    apiClient.get('/video-calls/history'),

  // WebRTC signaling
  sendSignal: (callId: string, signal: any): Promise<{ message: string }> =>
    apiClient.post(`/video-calls/${callId}/signal`, { signal }),

  // Typing indicators
  startTyping: (conversationId: string): Promise<void> =>
    apiClient.post(`/conversations/${conversationId}/typing/start`),

  stopTyping: (conversationId: string): Promise<void> =>
    apiClient.post(`/conversations/${conversationId}/typing/stop`),

  // Message reactions
  addReaction: (messageId: string, emoji: string): Promise<any> =>
    apiClient.post(`/messages/${messageId}/reactions`, { emoji }),

  removeReaction: (messageId: string, emoji: string): Promise<{ message: string }> =>
    apiClient.delete(`/messages/${messageId}/reactions/${emoji}`),

  // Conversation settings
  updateConversationSettings: (conversationId: string, settings: any): Promise<Conversation> =>
    apiClient.put(`/conversations/${conversationId}/settings`, settings),

  muteConversation: (conversationId: string, duration?: number): Promise<{ message: string }> =>
    apiClient.post(`/conversations/${conversationId}/mute`, { duration }),

  unmuteConversation: (conversationId: string): Promise<{ message: string }> =>
    apiClient.delete(`/conversations/${conversationId}/mute`),

  // Blocked users
  blockUser: (userId: string): Promise<{ message: string }> =>
    apiClient.post(`/users/${userId}/block`),

  unblockUser: (userId: string): Promise<{ message: string }> =>
    apiClient.delete(`/users/${userId}/block`),

  getBlockedUsers: (): Promise<any[]> =>
    apiClient.get('/users/blocked'),

  // Message templates
  getMessageTemplates: (): Promise<any[]> =>
    apiClient.get('/messages/templates'),

  createMessageTemplate: (template: any): Promise<any> =>
    apiClient.post('/messages/templates', template),

  updateMessageTemplate: (templateId: string, template: any): Promise<any> =>
    apiClient.put(`/messages/templates/${templateId}`, template),

  deleteMessageTemplate: (templateId: string): Promise<{ message: string }> =>
    apiClient.delete(`/messages/templates/${templateId}`),
}