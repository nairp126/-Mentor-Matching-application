import { apiClient } from './index'
import { 
  UserProfile, 
  ProfileUpdateData, 
  PrivacySettings,
  PaginatedResponse,
  SearchResult
} from '@/types'

export const userApi = {
  // Profile management
  getProfile: (userId?: string): Promise<UserProfile> =>
    apiClient.get(userId ? `/users/${userId}/profile` : '/users/profile'),

  updateProfile: (profileData: ProfileUpdateData): Promise<UserProfile> =>
    apiClient.put('/users/profile', profileData),

  // Image management
  uploadProfileImage: (file: File): Promise<{ imageUrl: string }> => {
    const formData = new FormData()
    formData.append('image', file)
    return apiClient.post('/users/profile/image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  deleteProfileImage: (): Promise<{ message: string }> =>
    apiClient.delete('/users/profile/image'),

  // Privacy settings
  getPrivacySettings: (): Promise<PrivacySettings> =>
    apiClient.get('/users/privacy'),

  updatePrivacySettings: (settings: PrivacySettings): Promise<PrivacySettings> =>
    apiClient.put('/users/privacy', settings),

  // User discovery and search
  searchUsers: (query: string, filters?: any): Promise<SearchResult<UserProfile>> =>
    apiClient.get('/users/search', { params: { q: query, ...filters } }),

  getMentors: (filters?: any): Promise<UserProfile[]> =>
    apiClient.get('/users/mentors', { params: filters }),

  getStudents: (filters?: any): Promise<UserProfile[]> =>
    apiClient.get('/users/students', { params: filters }),

  // Mentor-specific endpoints
  getMentorAvailability: (mentorId: string): Promise<any> =>
    apiClient.get(`/users/${mentorId}/availability`),

  updateAvailability: (availability: any): Promise<any> =>
    apiClient.put('/users/availability', availability),

  getMentorStats: (mentorId?: string): Promise<any> =>
    apiClient.get(mentorId ? `/users/${mentorId}/stats` : '/users/stats'),

  // Following/Favorites
  followMentor: (mentorId: string): Promise<{ message: string }> =>
    apiClient.post(`/users/${mentorId}/follow`),

  unfollowMentor: (mentorId: string): Promise<{ message: string }> =>
    apiClient.delete(`/users/${mentorId}/follow`),

  getFollowedMentors: (): Promise<UserProfile[]> =>
    apiClient.get('/users/following'),

  getFollowers: (): Promise<UserProfile[]> =>
    apiClient.get('/users/followers'),

  // Reviews and ratings
  getMentorReviews: (mentorId: string, page = 1, limit = 10): Promise<PaginatedResponse<any>> =>
    apiClient.get(`/users/${mentorId}/reviews`, { params: { page, limit } }),

  // Preferences
  getPreferences: (): Promise<any> =>
    apiClient.get('/users/preferences'),

  updatePreferences: (preferences: any): Promise<any> =>
    apiClient.put('/users/preferences', preferences),

  // Account verification
  requestVerification: (documents: File[]): Promise<{ message: string }> => {
    const formData = new FormData()
    documents.forEach((doc, index) => {
      formData.append(`document_${index}`, doc)
    })
    return apiClient.post('/users/verification/request', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  getVerificationStatus: (): Promise<any> =>
    apiClient.get('/users/verification/status'),
}