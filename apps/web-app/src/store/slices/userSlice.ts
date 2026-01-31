import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { userApi } from '@/services/api'
import { UserProfile, ProfileUpdateData, PrivacySettings } from '@/types'

interface UserState {
  profile: UserProfile | null
  profiles: UserProfile[]
  isLoading: boolean
  error: string | null
  uploadingImage: boolean
  searchResults: UserProfile[]
  searchLoading: boolean
}

const initialState: UserState = {
  profile: null,
  profiles: [],
  isLoading: false,
  error: null,
  uploadingImage: false,
  searchResults: [],
  searchLoading: false,
}

// Async thunks
export const fetchProfile = createAsyncThunk(
  'user/fetchProfile',
  async (userId: string | undefined, { rejectWithValue }) => {
    try {
      const response = await userApi.getProfile(userId)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch profile')
    }
  }
)

export const updateProfile = createAsyncThunk(
  'user/updateProfile',
  async (profileData: ProfileUpdateData, { rejectWithValue }) => {
    try {
      const response = await userApi.updateProfile(profileData)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update profile')
    }
  }
)

export const uploadProfileImage = createAsyncThunk(
  'user/uploadProfileImage',
  async (file: File, { rejectWithValue }) => {
    try {
      const response = await userApi.uploadProfileImage(file)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to upload image')
    }
  }
)

export const updatePrivacySettings = createAsyncThunk(
  'user/updatePrivacySettings',
  async (settings: PrivacySettings, { rejectWithValue }) => {
    try {
      const response = await userApi.updatePrivacySettings(settings)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update privacy settings')
    }
  }
)

export const searchUsers = createAsyncThunk(
  'user/searchUsers',
  async (query: string, { rejectWithValue }) => {
    try {
      const response = await userApi.searchUsers(query)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Search failed')
    }
  }
)

export const fetchMentors = createAsyncThunk(
  'user/fetchMentors',
  async (filters: any | undefined, { rejectWithValue }) => {
    try {
      const response = await userApi.getMentors(filters)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch mentors')
    }
  }
)

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    clearSearchResults: (state) => {
      state.searchResults = []
    },
    setProfile: (state, action: PayloadAction<UserProfile>) => {
      state.profile = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch profile
      .addCase(fetchProfile.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.isLoading = false
        state.profile = action.payload
      })
      .addCase(fetchProfile.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Update profile
      .addCase(updateProfile.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.isLoading = false
        state.profile = action.payload
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Upload profile image
      .addCase(uploadProfileImage.pending, (state) => {
        state.uploadingImage = true
        state.error = null
      })
      .addCase(uploadProfileImage.fulfilled, (state, action) => {
        state.uploadingImage = false
        if (state.profile) {
          state.profile.profileImageUrl = action.payload.imageUrl
        }
      })
      .addCase(uploadProfileImage.rejected, (state, action) => {
        state.uploadingImage = false
        state.error = action.payload as string
      })
      // Update privacy settings
      .addCase(updatePrivacySettings.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(updatePrivacySettings.fulfilled, (state, action) => {
        state.isLoading = false
        if (state.profile) {
          state.profile.privacySettings = action.payload
        }
      })
      .addCase(updatePrivacySettings.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Search users
      .addCase(searchUsers.pending, (state) => {
        state.searchLoading = true
        state.error = null
      })
      .addCase(searchUsers.fulfilled, (state, action) => {
        state.searchLoading = false
        state.searchResults = action.payload.items || action.payload
      })
      .addCase(searchUsers.rejected, (state, action) => {
        state.searchLoading = false
        state.error = action.payload as string
      })
      // Fetch mentors
      .addCase(fetchMentors.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchMentors.fulfilled, (state, action) => {
        state.isLoading = false
        state.profiles = action.payload
      })
      .addCase(fetchMentors.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
  },
})

export const { clearError, clearSearchResults, setProfile } = userSlice.actions
export default userSlice.reducer