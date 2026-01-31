import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { communicationApi } from '@/services/api'
import { Conversation, Message, VideoCallSession } from '@/types'

interface CommunicationState {
  conversations: Conversation[]
  currentConversation: Conversation | null
  messages: Message[]
  isLoading: boolean
  error: string | null
  sendingMessage: boolean
  videoCall: VideoCallSession | null
  onlineUsers: string[]
  typingUsers: { [conversationId: string]: string[] }
}

const initialState: CommunicationState = {
  conversations: [],
  currentConversation: null,
  messages: [],
  isLoading: false,
  error: null,
  sendingMessage: false,
  videoCall: null,
  onlineUsers: [],
  typingUsers: {},
}

// Async thunks
export const fetchConversations = createAsyncThunk(
  'communication/fetchConversations',
  async (_, { rejectWithValue }) => {
    try {
      const response = await communicationApi.getConversations()
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch conversations')
    }
  }
)

export const fetchConversation = createAsyncThunk(
  'communication/fetchConversation',
  async (conversationId: string, { rejectWithValue }) => {
    try {
      const response = await communicationApi.getConversation(conversationId)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch conversation')
    }
  }
)

export const fetchMessages = createAsyncThunk(
  'communication/fetchMessages',
  async ({ conversationId, page = 1 }: { conversationId: string; page?: number }, { rejectWithValue }) => {
    try {
      const response = await communicationApi.getMessages(conversationId, page)
      return { messages: response.data, page, conversationId }
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch messages')
    }
  }
)

export const sendMessage = createAsyncThunk(
  'communication/sendMessage',
  async ({ conversationId, content, type = 'TEXT' }: { conversationId: string; content: string; type?: string }, { rejectWithValue }) => {
    try {
      const response = await communicationApi.sendMessage(conversationId, content, type)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to send message')
    }
  }
)

export const createConversation = createAsyncThunk(
  'communication/createConversation',
  async (participantId: string, { rejectWithValue }) => {
    try {
      const response = await communicationApi.createConversation(participantId)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create conversation')
    }
  }
)

export const initiateVideoCall = createAsyncThunk(
  'communication/initiateVideoCall',
  async (participantId: string, { rejectWithValue }) => {
    try {
      const response = await communicationApi.initiateVideoCall(participantId)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to initiate video call')
    }
  }
)

export const searchMessages = createAsyncThunk(
  'communication/searchMessages',
  async ({ query, conversationId }: { query: string; conversationId?: string }, { rejectWithValue }) => {
    try {
      const response = await communicationApi.searchMessages(query, conversationId)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Search failed')
    }
  }
)

const communicationSlice = createSlice({
  name: 'communication',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    setCurrentConversation: (state, action: PayloadAction<Conversation | null>) => {
      state.currentConversation = action.payload
      if (!action.payload) {
        state.messages = []
      }
    },
    addMessage: (state, action: PayloadAction<Message>) => {
      const message = action.payload
      state.messages.push(message)
      
      // Update conversation's last message
      const conversation = state.conversations.find(c => c.id === message.conversationId)
      if (conversation) {
        conversation.lastMessage = message
        conversation.updatedAt = message.createdAt
      }
    },
    markMessageAsRead: (state, action: PayloadAction<string>) => {
      const messageId = action.payload
      const message = state.messages.find(m => m.id === messageId)
      if (message) {
        message.readAt = new Date()
      }
    },
    setOnlineUsers: (state, action: PayloadAction<string[]>) => {
      state.onlineUsers = action.payload
    },
    addOnlineUser: (state, action: PayloadAction<string>) => {
      if (!state.onlineUsers.includes(action.payload)) {
        state.onlineUsers.push(action.payload)
      }
    },
    removeOnlineUser: (state, action: PayloadAction<string>) => {
      state.onlineUsers = state.onlineUsers.filter(userId => userId !== action.payload)
    },
    setTypingUsers: (state, action: PayloadAction<{ conversationId: string; users: string[] }>) => {
      const { conversationId, users } = action.payload
      state.typingUsers[conversationId] = users
    },
    setVideoCall: (state, action: PayloadAction<VideoCallSession | null>) => {
      state.videoCall = action.payload
    },
    updateVideoCallStatus: (state, action: PayloadAction<{ callId: string; status: 'INITIATED' | 'RINGING' | 'ACTIVE' | 'ENDED' | 'DECLINED' }>) => {
      if (state.videoCall?.id === action.payload.callId) {
        state.videoCall.status = action.payload.status
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch conversations
      .addCase(fetchConversations.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.isLoading = false
        state.conversations = action.payload
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Fetch conversation
      .addCase(fetchConversation.fulfilled, (state, action) => {
        state.currentConversation = action.payload
      })
      // Fetch messages
      .addCase(fetchMessages.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.isLoading = false
        const { messages, page } = action.payload
        if (page === 1) {
          state.messages = messages
        } else {
          state.messages = [...messages, ...state.messages]
        }
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Send message
      .addCase(sendMessage.pending, (state) => {
        state.sendingMessage = true
        state.error = null
      })
      .addCase(sendMessage.fulfilled, (state) => {
        state.sendingMessage = false
        // Message will be added via socket event
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.sendingMessage = false
        state.error = action.payload as string
      })
      // Create conversation
      .addCase(createConversation.fulfilled, (state, action) => {
        state.conversations.unshift(action.payload)
        state.currentConversation = action.payload
      })
      // Initiate video call
      .addCase(initiateVideoCall.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(initiateVideoCall.fulfilled, (state, action) => {
        state.isLoading = false
        state.videoCall = action.payload
      })
      .addCase(initiateVideoCall.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
  },
})

export const {
  clearError,
  setCurrentConversation,
  addMessage,
  markMessageAsRead,
  setOnlineUsers,
  addOnlineUser,
  removeOnlineUser,
  setTypingUsers,
  setVideoCall,
  updateVideoCallStatus,
} = communicationSlice.actions

export default communicationSlice.reducer