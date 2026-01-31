import { apiClient } from './index'
import { 
  LoginCredentials, 
  RegisterData, 
  AuthResult, 
  MFASetup,
  User 
} from '@/types'

export const authApi = {
  // Authentication
  login: (credentials: LoginCredentials): Promise<AuthResult> =>
    apiClient.post('/auth/login', credentials),

  register: (userData: RegisterData): Promise<{ message: string }> =>
    apiClient.post('/auth/register', userData),

  logout: (): Promise<void> =>
    apiClient.post('/auth/logout'),

  refreshToken: (refreshToken: string): Promise<AuthResult> =>
    apiClient.post('/auth/refresh', { refreshToken }),

  // Email verification
  verifyEmail: (token: string): Promise<{ message: string }> =>
    apiClient.post('/auth/verify-email', { token }),

  resendVerification: (email: string): Promise<{ message: string }> =>
    apiClient.post('/auth/resend-verification', { email }),

  // Password reset
  requestPasswordReset: (email: string): Promise<{ message: string }> =>
    apiClient.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string): Promise<{ message: string }> =>
    apiClient.post('/auth/reset-password', { token, newPassword }),

  changePassword: (currentPassword: string, newPassword: string): Promise<{ message: string }> =>
    apiClient.post('/auth/change-password', { currentPassword, newPassword }),

  // Multi-factor authentication
  setupMFA: (method: string): Promise<MFASetup> =>
    apiClient.post('/auth/mfa/setup', { method }),

  verifyMFA: (token: string, code: string): Promise<AuthResult> =>
    apiClient.post('/auth/mfa/verify', { token, code }),

  disableMFA: (password: string): Promise<{ message: string }> =>
    apiClient.post('/auth/mfa/disable', { password }),

  generateBackupCodes: (): Promise<{ backupCodes: string[] }> =>
    apiClient.post('/auth/mfa/backup-codes'),

  // Profile and session management
  getCurrentUser: (): Promise<User> =>
    apiClient.get('/auth/me'),

  updateProfile: (profileData: any): Promise<User> =>
    apiClient.patch('/auth/profile', profileData),

  // Security
  getSessions: (): Promise<any[]> =>
    apiClient.get('/auth/sessions'),

  revokeSession: (sessionId: string): Promise<{ message: string }> =>
    apiClient.delete(`/auth/sessions/${sessionId}`),

  revokeAllSessions: (): Promise<{ message: string }> =>
    apiClient.delete('/auth/sessions'),

  // Account management
  deleteAccount: (password: string): Promise<{ message: string }> =>
    apiClient.delete('/auth/account', { data: { password } }),
}