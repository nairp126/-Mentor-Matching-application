import { apiClient } from './index'
import { 
  Notification, 
  NotificationPreferences,
  PaginatedResponse 
} from '@/types'

export const notificationApi = {
  // Notifications
  getNotifications: (params: { 
    page?: number
    limit?: number
    unreadOnly?: boolean
    type?: string
  } = {}): Promise<PaginatedResponse<Notification> & { unreadCount: number }> =>
    apiClient.get('/notifications', { params }),

  getNotification: (notificationId: string): Promise<Notification> =>
    apiClient.get(`/notifications/${notificationId}`),

  markAsRead: (notificationId: string): Promise<{ message: string }> =>
    apiClient.post(`/notifications/${notificationId}/read`),

  markAllAsRead: (): Promise<{ message: string }> =>
    apiClient.post('/notifications/read-all'),

  deleteNotification: (notificationId: string): Promise<{ message: string }> =>
    apiClient.delete(`/notifications/${notificationId}`),

  deleteAllNotifications: (): Promise<{ message: string }> =>
    apiClient.delete('/notifications'),

  // Notification preferences
  getPreferences: (): Promise<NotificationPreferences> =>
    apiClient.get('/notifications/preferences'),

  updatePreferences: (preferences: NotificationPreferences): Promise<NotificationPreferences> =>
    apiClient.put('/notifications/preferences', preferences),

  // Push notifications
  subscribeToPush: (subscription: any): Promise<{ message: string }> =>
    apiClient.post('/notifications/push/subscribe', subscription),

  unsubscribeFromPush: (): Promise<{ message: string }> =>
    apiClient.delete('/notifications/push/subscribe'),

  testPushNotification: (): Promise<{ message: string }> =>
    apiClient.post('/notifications/push/test'),

  // Email notifications
  unsubscribeFromEmail: (token: string): Promise<{ message: string }> =>
    apiClient.post('/notifications/email/unsubscribe', { token }),

  resubscribeToEmail: (): Promise<{ message: string }> =>
    apiClient.post('/notifications/email/resubscribe'),

  // SMS notifications
  updatePhoneNumber: (phoneNumber: string): Promise<{ message: string }> =>
    apiClient.put('/notifications/sms/phone', { phoneNumber }),

  verifyPhoneNumber: (code: string): Promise<{ message: string }> =>
    apiClient.post('/notifications/sms/verify', { code }),

  // Notification templates (admin)
  getTemplates: (): Promise<any[]> =>
    apiClient.get('/notifications/templates'),

  createTemplate: (template: any): Promise<any> =>
    apiClient.post('/notifications/templates', template),

  updateTemplate: (templateId: string, template: any): Promise<any> =>
    apiClient.put(`/notifications/templates/${templateId}`, template),

  deleteTemplate: (templateId: string): Promise<{ message: string }> =>
    apiClient.delete(`/notifications/templates/${templateId}`),

  // Notification statistics
  getStats: (timeRange?: string): Promise<any> =>
    apiClient.get('/notifications/stats', { params: { timeRange } }),

  // Digest notifications
  getDigestPreview: (type: 'daily' | 'weekly'): Promise<any> =>
    apiClient.get(`/notifications/digest/${type}/preview`),

  updateDigestSettings: (settings: any): Promise<any> =>
    apiClient.put('/notifications/digest/settings', settings),

  // Notification channels
  testChannel: (channel: 'email' | 'sms' | 'push'): Promise<{ message: string }> =>
    apiClient.post(`/notifications/test/${channel}`),

  getChannelStatus: (): Promise<any> =>
    apiClient.get('/notifications/channels/status'),

  // Scheduled notifications
  getScheduledNotifications: (): Promise<any[]> =>
    apiClient.get('/notifications/scheduled'),

  cancelScheduledNotification: (notificationId: string): Promise<{ message: string }> =>
    apiClient.delete(`/notifications/scheduled/${notificationId}`),

  // Notification history
  getHistory: (params: {
    page?: number
    limit?: number
    startDate?: string
    endDate?: string
    type?: string
  } = {}): Promise<PaginatedResponse<any>> =>
    apiClient.get('/notifications/history', { params }),

  exportHistory: (format: 'csv' | 'json', filters?: any): Promise<Blob> =>
    apiClient.get('/notifications/history/export', {
      params: { format, ...filters },
      responseType: 'blob'
    }),
}