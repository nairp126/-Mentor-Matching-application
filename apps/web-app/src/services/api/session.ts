import { apiClient } from './index'
import { 
  Session, 
  SessionCreateData, 
  SessionFilters, 
  SessionRegistration,
  PaginatedResponse 
} from '@/types'

export const sessionApi = {
  // Session management
  getSessions: (params: { 
    filters?: SessionFilters
    page?: number
    limit?: number
    sort?: string
  } = {}): Promise<PaginatedResponse<Session>> =>
    apiClient.get('/sessions', { params }),

  getSession: (sessionId: string): Promise<Session> =>
    apiClient.get(`/sessions/${sessionId}`),

  createSession: (sessionData: SessionCreateData): Promise<Session> =>
    apiClient.post('/sessions', sessionData),

  updateSession: (sessionId: string, updates: Partial<SessionCreateData>): Promise<Session> =>
    apiClient.put(`/sessions/${sessionId}`, updates),

  deleteSession: (sessionId: string): Promise<{ message: string }> =>
    apiClient.delete(`/sessions/${sessionId}`),

  // Session registration
  registerForSession: (sessionId: string): Promise<SessionRegistration> =>
    apiClient.post(`/sessions/${sessionId}/register`),

  cancelRegistration: (sessionId: string): Promise<{ message: string; sessionId: string }> =>
    apiClient.delete(`/sessions/${sessionId}/register`),

  getSessionRegistrations: (sessionId: string): Promise<SessionRegistration[]> =>
    apiClient.get(`/sessions/${sessionId}/registrations`),

  // Waitlist management
  joinWaitlist: (sessionId: string): Promise<any> =>
    apiClient.post(`/sessions/${sessionId}/waitlist`),

  leaveWaitlist: (sessionId: string): Promise<{ message: string }> =>
    apiClient.delete(`/sessions/${sessionId}/waitlist`),

  getWaitlist: (sessionId: string): Promise<any[]> =>
    apiClient.get(`/sessions/${sessionId}/waitlist`),

  // My sessions
  getMySessions: (type?: 'created' | 'registered' | 'all'): Promise<Session[]> =>
    apiClient.get('/sessions/my', { params: { type } }),

  getMyRegistrations: (): Promise<SessionRegistration[]> =>
    apiClient.get('/sessions/registrations'),

  // Session materials
  uploadMaterial: (sessionId: string, file: File, description?: string): Promise<any> => {
    const formData = new FormData()
    formData.append('file', file)
    if (description) {
      formData.append('description', description)
    }
    return apiClient.post(`/sessions/${sessionId}/materials`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  deleteMaterial: (sessionId: string, materialId: string): Promise<{ message: string }> =>
    apiClient.delete(`/sessions/${sessionId}/materials/${materialId}`),

  getMaterials: (sessionId: string): Promise<any[]> =>
    apiClient.get(`/sessions/${sessionId}/materials`),

  // Session feedback and ratings
  submitFeedback: (sessionId: string, feedback: {
    rating: number
    comment?: string
    anonymous?: boolean
  }): Promise<{ message: string }> =>
    apiClient.post(`/sessions/${sessionId}/feedback`, feedback),

  getFeedback: (sessionId: string): Promise<any[]> =>
    apiClient.get(`/sessions/${sessionId}/feedback`),

  // Recurring sessions
  createRecurringSession: (sessionData: SessionCreateData & {
    recurringPattern: any
  }): Promise<Session[]> =>
    apiClient.post('/sessions/recurring', sessionData),

  updateRecurringSeries: (seriesId: string, updates: any): Promise<Session[]> =>
    apiClient.put(`/sessions/recurring/${seriesId}`, updates),

  deleteRecurringSeries: (seriesId: string): Promise<{ message: string }> =>
    apiClient.delete(`/sessions/recurring/${seriesId}`),

  // Session status management
  startSession: (sessionId: string): Promise<Session> =>
    apiClient.post(`/sessions/${sessionId}/start`),

  endSession: (sessionId: string): Promise<Session> =>
    apiClient.post(`/sessions/${sessionId}/end`),

  cancelSession: (sessionId: string, reason?: string): Promise<Session> =>
    apiClient.post(`/sessions/${sessionId}/cancel`, { reason }),

  // Attendance tracking
  markAttendance: (sessionId: string, studentId: string, status: 'ATTENDED' | 'NO_SHOW'): Promise<any> =>
    apiClient.post(`/sessions/${sessionId}/attendance`, { studentId, status }),

  getAttendance: (sessionId: string): Promise<any[]> =>
    apiClient.get(`/sessions/${sessionId}/attendance`),

  // Session analytics
  getSessionAnalytics: (sessionId: string): Promise<any> =>
    apiClient.get(`/sessions/${sessionId}/analytics`),

  getMentorAnalytics: (timeRange?: string): Promise<any> =>
    apiClient.get('/sessions/analytics/mentor', { params: { timeRange } }),

  getStudentAnalytics: (timeRange?: string): Promise<any> =>
    apiClient.get('/sessions/analytics/student', { params: { timeRange } }),
}