import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { authApi } from '@/services/api'
import { User, LoginCredentials, RegisterData, MFASetup } from '@/types'

interface AuthState {
  user: User | null
  token: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  mfaRequired: boolean
  mfaSetup: MFASetup | null
}

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('token'),
  refreshToken: localStorage.getItem('refreshToken'),
  isAuthenticated: false,
  isLoading: false,
  error: null,
  mfaRequired: false,
  mfaSetup: null,
}

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      const response = await authApi.login(credentials)
      // Unwrap the nested data object
      const data = response.data || response
      localStorage.setItem('token', data.accessToken)
      localStorage.setItem('refreshToken', data.refreshToken)
      return data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Login failed')
    }
  }
)

export const register = createAsyncThunk(
  'auth/register',
  async (userData: RegisterData, { rejectWithValue }) => {
    try {
      const response = await authApi.register(userData)
      // Unwrap the nested data object
      return response.data || response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Registration failed')
    }
  }
)

export const logout = createAsyncThunk('auth/logout', async () => {
  localStorage.removeItem('token')
  localStorage.removeItem('refreshToken')
  return null
})

export const refreshAccessToken = createAsyncThunk(
  'auth/refreshToken',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: AuthState }
      const refreshToken = state.auth.refreshToken
      if (!refreshToken) {
        throw new Error('No refresh token available')
      }
      const response = await authApi.refreshToken(refreshToken)
      // Unwrap the nested data object
      const data = response.data || response
      localStorage.setItem('token', data.accessToken)
      return data
    } catch (error: any) {
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      return rejectWithValue(error.response?.data?.message || 'Token refresh failed')
    }
  }
)

export const verifyMFA = createAsyncThunk(
  'auth/verifyMFA',
  async ({ token, code }: { token: string; code: string }, { rejectWithValue }) => {
    try {
      const response = await authApi.verifyMFA(token, code)
      // Unwrap the nested data object
      const data = response.data || response
      localStorage.setItem('token', data.accessToken)
      localStorage.setItem('refreshToken', data.refreshToken)
      return data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'MFA verification failed')
    }
  }
)

export const setupMFA = createAsyncThunk(
  'auth/setupMFA',
  async (method: string, { rejectWithValue }) => {
    try {
      const response = await authApi.setupMFA(method)
      // Unwrap the nested data object
      return response.data || response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'MFA setup failed')
    }
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    setMFARequired: (state, action: PayloadAction<boolean>) => {
      state.mfaRequired = action.payload
    },
    clearMFASetup: (state) => {
      state.mfaSetup = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(login.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false
        state.user = action.payload.user
        state.token = action.payload.accessToken
        state.refreshToken = action.payload.refreshToken
        state.isAuthenticated = true
        state.mfaRequired = false
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
        state.mfaRequired = action.payload === 'MFA_REQUIRED'
      })
      // Register
      .addCase(register.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(register.fulfilled, (state) => {
        state.isLoading = false
        state.error = null
      })
      .addCase(register.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Logout
      .addCase(logout.fulfilled, (state) => {
        state.user = null
        state.token = null
        state.refreshToken = null
        state.isAuthenticated = false
        state.mfaRequired = false
        state.mfaSetup = null
      })
      // Refresh token
      .addCase(refreshAccessToken.fulfilled, (state, action) => {
        state.token = action.payload.accessToken
        state.user = action.payload.user
        state.isAuthenticated = true
      })
      .addCase(refreshAccessToken.rejected, (state) => {
        state.user = null
        state.token = null
        state.refreshToken = null
        state.isAuthenticated = false
      })
      // MFA verification
      .addCase(verifyMFA.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(verifyMFA.fulfilled, (state, action) => {
        state.isLoading = false
        state.user = action.payload.user
        state.token = action.payload.accessToken
        state.refreshToken = action.payload.refreshToken
        state.isAuthenticated = true
        state.mfaRequired = false
      })
      .addCase(verifyMFA.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // MFA setup
      .addCase(setupMFA.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(setupMFA.fulfilled, (state, action) => {
        state.isLoading = false
        state.mfaSetup = action.payload
      })
      .addCase(setupMFA.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
  },
})

export const { clearError, setMFARequired, clearMFASetup } = authSlice.actions
export default authSlice.reducer