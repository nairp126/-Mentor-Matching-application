import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { notificationApi } from '@/services/api'
import { Notification, NotificationPreferences } from '@/types'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  preferences: NotificationPreferences | null
  isLoading: boolean
  error: string | null
  markingAsRead: boolean
}

const initialState: NotificationState = {
  notifications: [],
  unreadCount: 0,
  preferences: null,
  isLoading: false,
  error: null,
  markingAsRead: false,
}

// Async thunks
export const fetchNotifications = createAsyncThunk(
  'notification/fetchNotifications',
  async (params: { page?: number; limit?: number } = {}, { rejectWithValue }) => {
    try {
      const response = await notificationApi.getNotifications(params)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch notifications')
    }
  }
)

export const markAsRead = createAsyncThunk(
  'notification/markAsRead',
  async (notificationId: string, { rejectWithValue }) => {
    try {
      await notificationApi.markAsRead(notificationId)
      return notificationId
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to mark as read')
    }
  }
)

export const markAllAsRead = createAsyncThunk(
  'notification/markAllAsRead',
  async (_, { rejectWithValue }) => {
    try {
      await notificationApi.markAllAsRead()
      return null
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to mark all as read')
    }
  }
)

export const fetchPreferences = createAsyncThunk(
  'notification/fetchPreferences',
  async (_, { rejectWithValue }) => {
    try {
      const response = await notificationApi.getPreferences()
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch preferences')
    }
  }
)

export const updatePreferences = createAsyncThunk(
  'notification/updatePreferences',
  async (preferences: NotificationPreferences, { rejectWithValue }) => {
    try {
      const response = await notificationApi.updatePreferences(preferences)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update preferences')
    }
  }
)

export const deleteNotification = createAsyncThunk(
  'notification/deleteNotification',
  async (notificationId: string, { rejectWithValue }) => {
    try {
      await notificationApi.deleteNotification(notificationId)
      return notificationId
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete notification')
    }
  }
)

const notificationSlice = createSlice({
  name: 'notification',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    addNotification: (state, action: PayloadAction<Notification>) => {
      state.notifications.unshift(action.payload)
      if (!action.payload.readAt) {
        state.unreadCount += 1
      }
    },
    updateNotification: (state, action: PayloadAction<Notification>) => {
      const index = state.notifications.findIndex(n => n.id === action.payload.id)
      if (index !== -1) {
        state.notifications[index] = action.payload
      }
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      const notification = state.notifications.find(n => n.id === action.payload)
      if (notification && !notification.readAt) {
        state.unreadCount -= 1
      }
      state.notifications = state.notifications.filter(n => n.id !== action.payload)
    },
    clearAllNotifications: (state) => {
      state.notifications = []
      state.unreadCount = 0
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch notifications
      .addCase(fetchNotifications.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.isLoading = false
        const { data: notifications } = action.payload
        state.notifications = notifications
        state.unreadCount = notifications.filter(n => !n.readAt).length
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Mark as read
      .addCase(markAsRead.pending, (state) => {
        state.markingAsRead = true
      })
      .addCase(markAsRead.fulfilled, (state, action) => {
        state.markingAsRead = false
        const notificationId = action.payload
        const notification = state.notifications.find(n => n.id === notificationId)
        if (notification && !notification.readAt) {
          notification.readAt = new Date()
          state.unreadCount -= 1
        }
      })
      .addCase(markAsRead.rejected, (state, action) => {
        state.markingAsRead = false
        state.error = action.payload as string
      })
      // Mark all as read
      .addCase(markAllAsRead.fulfilled, (state) => {
        state.notifications.forEach(notification => {
          if (!notification.readAt) {
            notification.readAt = new Date()
          }
        })
        state.unreadCount = 0
      })
      // Fetch preferences
      .addCase(fetchPreferences.fulfilled, (state, action) => {
        state.preferences = action.payload
      })
      // Update preferences
      .addCase(updatePreferences.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(updatePreferences.fulfilled, (state, action) => {
        state.isLoading = false
        state.preferences = action.payload
      })
      .addCase(updatePreferences.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Delete notification
      .addCase(deleteNotification.fulfilled, (state, action) => {
        const notificationId = action.payload
        const notification = state.notifications.find(n => n.id === notificationId)
        if (notification && !notification.readAt) {
          state.unreadCount -= 1
        }
        state.notifications = state.notifications.filter(n => n.id !== notificationId)
      })
  },
})

export const {
  clearError,
  addNotification,
  updateNotification,
  removeNotification,
  clearAllNotifications,
} = notificationSlice.actions

export default notificationSlice.reducer