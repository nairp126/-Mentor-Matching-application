import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { sessionApi } from '@/services/api'
import { Session, SessionCreateData, SessionFilters, SessionRegistration } from '@/types'

interface SessionState {
  sessions: Session[]
  currentSession: Session | null
  mySessions: Session[]
  registrations: SessionRegistration[]
  isLoading: boolean
  error: string | null
  creating: boolean
  registering: boolean
  filters: SessionFilters
  pagination: {
    page: number
    limit: number
    total: number
    hasMore: boolean
  }
}

const initialState: SessionState = {
  sessions: [],
  currentSession: null,
  mySessions: [],
  registrations: [],
  isLoading: false,
  error: null,
  creating: false,
  registering: false,
  filters: {},
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    hasMore: true,
  },
}

// Async thunks
export const fetchSessions = createAsyncThunk(
  'session/fetchSessions',
  async (params: { filters?: SessionFilters; page?: number; limit?: number }, { rejectWithValue }) => {
    try {
      const response = await sessionApi.getSessions(params)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch sessions')
    }
  }
)

export const fetchSession = createAsyncThunk(
  'session/fetchSession',
  async (sessionId: string, { rejectWithValue }) => {
    try {
      const response = await sessionApi.getSession(sessionId)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch session')
    }
  }
)

export const createSession = createAsyncThunk(
  'session/createSession',
  async (sessionData: SessionCreateData, { rejectWithValue }) => {
    try {
      const response = await sessionApi.createSession(sessionData)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create session')
    }
  }
)

export const updateSession = createAsyncThunk(
  'session/updateSession',
  async ({ sessionId, updates }: { sessionId: string; updates: Partial<SessionCreateData> }, { rejectWithValue }) => {
    try {
      const response = await sessionApi.updateSession(sessionId, updates)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update session')
    }
  }
)

export const registerForSession = createAsyncThunk(
  'session/registerForSession',
  async (sessionId: string, { rejectWithValue }) => {
    try {
      const response = await sessionApi.registerForSession(sessionId)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to register for session')
    }
  }
)

export const cancelRegistration = createAsyncThunk(
  'session/cancelRegistration',
  async (sessionId: string, { rejectWithValue }) => {
    try {
      const response = await sessionApi.cancelRegistration(sessionId)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to cancel registration')
    }
  }
)

export const fetchMySessions = createAsyncThunk(
  'session/fetchMySessions',
  async (_, { rejectWithValue }) => {
    try {
      const response = await sessionApi.getMySessions()
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch your sessions')
    }
  }
)

export const fetchMyRegistrations = createAsyncThunk(
  'session/fetchMyRegistrations',
  async (_, { rejectWithValue }) => {
    try {
      const response = await sessionApi.getMyRegistrations()
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch your registrations')
    }
  }
)

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    setFilters: (state, action: PayloadAction<SessionFilters>) => {
      state.filters = action.payload
      state.pagination.page = 1
    },
    clearCurrentSession: (state) => {
      state.currentSession = null
    },
    resetPagination: (state) => {
      state.pagination = {
        page: 1,
        limit: 20,
        total: 0,
        hasMore: true,
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch sessions
      .addCase(fetchSessions.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchSessions.fulfilled, (state, action) => {
        state.isLoading = false
        const { data: sessions, pagination } = action.payload
        if (pagination.page === 1) {
          state.sessions = sessions
        } else {
          state.sessions = [...state.sessions, ...sessions]
        }
        state.pagination = pagination
      })
      .addCase(fetchSessions.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Fetch single session
      .addCase(fetchSession.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchSession.fulfilled, (state, action) => {
        state.isLoading = false
        state.currentSession = action.payload
      })
      .addCase(fetchSession.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Create session
      .addCase(createSession.pending, (state) => {
        state.creating = true
        state.error = null
      })
      .addCase(createSession.fulfilled, (state, action) => {
        state.creating = false
        state.sessions.unshift(action.payload)
        state.mySessions.unshift(action.payload)
      })
      .addCase(createSession.rejected, (state, action) => {
        state.creating = false
        state.error = action.payload as string
      })
      // Update session
      .addCase(updateSession.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(updateSession.fulfilled, (state, action) => {
        state.isLoading = false
        const updatedSession = action.payload
        state.sessions = state.sessions.map(session =>
          session.id === updatedSession.id ? updatedSession : session
        )
        state.mySessions = state.mySessions.map(session =>
          session.id === updatedSession.id ? updatedSession : session
        )
        if (state.currentSession?.id === updatedSession.id) {
          state.currentSession = updatedSession
        }
      })
      .addCase(updateSession.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Register for session
      .addCase(registerForSession.pending, (state) => {
        state.registering = true
        state.error = null
      })
      .addCase(registerForSession.fulfilled, (state, action) => {
        state.registering = false
        state.registrations.push(action.payload)
        // Update session in the list
        const sessionId = action.payload.sessionId
        state.sessions = state.sessions.map(session =>
          session.id === sessionId
            ? { ...session, currentRegistrations: session.currentRegistrations + 1 }
            : session
        )
      })
      .addCase(registerForSession.rejected, (state, action) => {
        state.registering = false
        state.error = action.payload as string
      })
      // Cancel registration
      .addCase(cancelRegistration.fulfilled, (state, action) => {
        const sessionId = action.payload.sessionId
        state.registrations = state.registrations.filter(reg => reg.sessionId !== sessionId)
        // Update session in the list
        state.sessions = state.sessions.map(session =>
          session.id === sessionId
            ? { ...session, currentRegistrations: session.currentRegistrations - 1 }
            : session
        )
      })
      // Fetch my sessions
      .addCase(fetchMySessions.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchMySessions.fulfilled, (state, action) => {
        state.isLoading = false
        state.mySessions = action.payload
      })
      .addCase(fetchMySessions.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Fetch my registrations
      .addCase(fetchMyRegistrations.fulfilled, (state, action) => {
        state.registrations = action.payload
      })
  },
})

export const { clearError, setFilters, clearCurrentSession, resetPagination } = sessionSlice.actions
export default sessionSlice.reducer