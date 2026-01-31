import { apiClient } from './index'
import { 
  Session, 
  UserProfile,
  SearchResult 
} from '@/types'

export interface SessionRecommendation {
  session: Session
  compatibilityScore: number
  reasons: string[]
  mentor: UserProfile
}

export interface MatchingPreferences {
  expertiseAreas: string[]
  sessionTypes: string[]
  priceRange?: {
    min: number
    max: number
  }
  timePreferences: {
    daysOfWeek: number[]
    timeSlots: string[]
  }
  mentorPreferences: {
    experienceLevel: string
    rating: number
    languages: string[]
  }
}

export const matchingApi = {
  // Session recommendations
  getRecommendations: (params: {
    limit?: number
    page?: number
    filters?: any
  } = {}): Promise<SessionRecommendation[]> =>
    apiClient.get('/matching/recommendations', { params }),

  getPersonalizedRecommendations: (userId?: string): Promise<SessionRecommendation[]> =>
    apiClient.get('/matching/personalized', { params: { userId } }),

  // Mentor recommendations
  getMentorRecommendations: (params: {
    limit?: number
    expertiseArea?: string
    filters?: any
  } = {}): Promise<UserProfile[]> =>
    apiClient.get('/matching/mentors', { params }),

  // Search and discovery
  searchSessions: (query: string, filters?: any): Promise<SearchResult<Session>> =>
    apiClient.get('/matching/search/sessions', { 
      params: { q: query, ...filters } 
    }),

  searchMentors: (query: string, filters?: any): Promise<SearchResult<UserProfile>> =>
    apiClient.get('/matching/search/mentors', { 
      params: { q: query, ...filters } 
    }),

  // Advanced search
  advancedSearch: (criteria: {
    query?: string
    expertiseAreas?: string[]
    sessionTypes?: string[]
    priceRange?: { min: number; max: number }
    dateRange?: { start: string; end: string }
    mentorRating?: number
    location?: string
    languages?: string[]
  }): Promise<SearchResult<Session>> =>
    apiClient.post('/matching/search/advanced', criteria),

  // Matching preferences
  getPreferences: (): Promise<MatchingPreferences> =>
    apiClient.get('/matching/preferences'),

  updatePreferences: (preferences: MatchingPreferences): Promise<MatchingPreferences> =>
    apiClient.put('/matching/preferences', preferences),

  // Feedback and learning
  recordFeedback: (sessionId: string, feedback: {
    helpful: boolean
    reason?: string
    suggestions?: string[]
  }): Promise<{ message: string }> =>
    apiClient.post(`/matching/feedback/${sessionId}`, feedback),

  recordInteraction: (type: 'view' | 'click' | 'register', itemId: string, itemType: 'session' | 'mentor'): Promise<void> =>
    apiClient.post('/matching/interactions', { type, itemId, itemType }),

  // Similarity and compatibility
  getSimilarSessions: (sessionId: string, limit = 5): Promise<Session[]> =>
    apiClient.get(`/matching/similar/sessions/${sessionId}`, { params: { limit } }),

  getSimilarMentors: (mentorId: string, limit = 5): Promise<UserProfile[]> =>
    apiClient.get(`/matching/similar/mentors/${mentorId}`, { params: { limit } }),

  getCompatibilityScore: (mentorId: string): Promise<{ score: number; factors: any[] }> =>
    apiClient.get(`/matching/compatibility/${mentorId}`),

  // Trending and popular
  getTrendingSessions: (timeframe: 'day' | 'week' | 'month' = 'week'): Promise<Session[]> =>
    apiClient.get('/matching/trending/sessions', { params: { timeframe } }),

  getPopularMentors: (timeframe: 'day' | 'week' | 'month' = 'week'): Promise<UserProfile[]> =>
    apiClient.get('/matching/trending/mentors', { params: { timeframe } }),

  getTrendingTopics: (): Promise<{ topic: string; count: number; growth: number }[]> =>
    apiClient.get('/matching/trending/topics'),

  // Saved items
  saveSession: (sessionId: string): Promise<{ message: string }> =>
    apiClient.post(`/matching/saved/sessions/${sessionId}`),

  unsaveSession: (sessionId: string): Promise<{ message: string }> =>
    apiClient.delete(`/matching/saved/sessions/${sessionId}`),

  getSavedSessions: (): Promise<Session[]> =>
    apiClient.get('/matching/saved/sessions'),

  saveMentor: (mentorId: string): Promise<{ message: string }> =>
    apiClient.post(`/matching/saved/mentors/${mentorId}`),

  unsaveMentor: (mentorId: string): Promise<{ message: string }> =>
    apiClient.delete(`/matching/saved/mentors/${mentorId}`),

  getSavedMentors: (): Promise<UserProfile[]> =>
    apiClient.get('/matching/saved/mentors'),

  // Filters and categories
  getExpertiseAreas: (): Promise<{ name: string; count: number }[]> =>
    apiClient.get('/matching/expertise-areas'),

  getSessionTypes: (): Promise<{ type: string; count: number }[]> =>
    apiClient.get('/matching/session-types'),

  getLanguages: (): Promise<{ language: string; count: number }[]> =>
    apiClient.get('/matching/languages'),

  getLocations: (): Promise<{ location: string; count: number }[]> =>
    apiClient.get('/matching/locations'),

  // Analytics and insights
  getMatchingStats: (): Promise<{
    totalRecommendations: number
    clickThroughRate: number
    conversionRate: number
    averageCompatibilityScore: number
  }> =>
    apiClient.get('/matching/stats'),

  getPersonalInsights: (): Promise<{
    topInterests: string[]
    learningProgress: any[]
    recommendationAccuracy: number
    engagementScore: number
  }> =>
    apiClient.get('/matching/insights'),

  // A/B testing and experiments
  getExperimentVariant: (experimentId: string): Promise<{ variant: string; config: any }> =>
    apiClient.get(`/matching/experiments/${experimentId}/variant`),

  recordExperimentEvent: (experimentId: string, event: string, data?: any): Promise<void> =>
    apiClient.post(`/matching/experiments/${experimentId}/events`, { event, data }),
}