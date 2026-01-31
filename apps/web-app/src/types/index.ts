// Re-export shared types
export * from '@shared/types'

// Additional frontend-specific types
export interface LoginCredentials {
  email: string
  password: string
  mfaCode?: string
}

export interface RegisterData {
  email: string
  password: string
  confirmPassword: string
  firstName: string
  lastName: string
  role: 'MENTOR' | 'STUDENT'
  acceptTerms: boolean
}

export interface MFASetup {
  secret: string
  qrCode: string
  backupCodes: string[]
}

export interface AuthResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: User
}

export interface User {
  id: string
  email: string
  role: 'MENTOR' | 'STUDENT' | 'ADMIN'
  emailVerified: boolean
  mfaEnabled: boolean
  createdAt: Date
  updatedAt: Date
  profile?: UserProfile
}

export interface UserProfile {
  id: string
  userId: string
  firstName: string
  lastName: string
  bio: string
  profileImageUrl?: string
  role: 'MENTOR' | 'STUDENT'
  mentorProfile?: MentorProfile
  studentProfile?: StudentProfile
  privacySettings: PrivacySettings
  createdAt: Date
  updatedAt: Date
}

export interface MentorProfile {
  expertiseAreas: string[]
  yearsOfExperience: number
  hourlyRate?: number
  availability: AvailabilitySlot[]
  socialLinks: SocialLink[]
  rating: number
  totalSessions: number
  completedSessions: number
  languages: string[]
  timezone: string
}

export interface StudentProfile {
  learningGoals: string[]
  interests: string[]
  currentLevel: SkillLevel
  preferredSessionTypes: SessionType[]
  languages: string[]
  timezone: string
}

export interface AvailabilitySlot {
  dayOfWeek: number // 0-6 (Sunday-Saturday)
  startTime: string // HH:mm format
  endTime: string // HH:mm format
}

export interface SocialLink {
  platform: string
  url: string
}

export interface PrivacySettings {
  profileVisibility: 'PUBLIC' | 'MENTORS_ONLY' | 'PRIVATE'
  showEmail: boolean
  showSocialLinks: boolean
  allowMessages: boolean
  allowVideoCall: boolean
}

export interface Session {
  id: string
  mentorId: string
  mentor?: UserProfile
  title: string
  description: string
  expertiseAreas: string[]
  sessionType: SessionType
  scheduledAt: Date
  duration: number // minutes
  capacity: number
  currentRegistrations: number
  registeredStudents: SessionRegistration[]
  waitlist: WaitlistEntry[]
  status: SessionStatus
  meetingLink?: string
  materials: SessionMaterial[]
  price?: number
  currency?: string
  createdAt: Date
  updatedAt: Date
}

export interface SessionCreateData {
  title: string
  description: string
  expertiseAreas: string[]
  sessionType: SessionType
  scheduledAt: Date
  duration: number
  capacity: number
  price?: number
  currency?: string
  materials?: SessionMaterial[]
  isRecurring?: boolean
  recurringPattern?: RecurringPattern
}

export interface SessionRegistration {
  id: string
  sessionId: string
  studentId: string
  student?: UserProfile
  registeredAt: Date
  status: 'REGISTERED' | 'ATTENDED' | 'NO_SHOW' | 'CANCELLED'
  feedback?: string
  rating?: number
}

export interface WaitlistEntry {
  id: string
  sessionId: string
  studentId: string
  student?: UserProfile
  addedAt: Date
  position: number
}

export interface SessionMaterial {
  id: string
  name: string
  type: 'DOCUMENT' | 'LINK' | 'VIDEO' | 'IMAGE'
  url: string
  description?: string
}

export interface RecurringPattern {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  interval: number
  endDate?: Date
  occurrences?: number
}

export interface SessionFilters {
  expertiseAreas?: string[]
  sessionType?: SessionType
  dateRange?: {
    start: Date
    end: Date
  }
  priceRange?: {
    min: number
    max: number
  }
  mentorId?: string
  status?: SessionStatus
  search?: string
}

export interface Conversation {
  id: string
  participants: string[]
  participantProfiles?: UserProfile[]
  lastMessage?: Message
  unreadCount: number
  createdAt: Date
  updatedAt: Date
}

export interface Message {
  id: string
  conversationId: string
  fromUserId: string
  fromUser?: UserProfile
  content: string
  type: MessageType
  metadata?: Record<string, any>
  createdAt: Date
  editedAt?: Date
  readAt?: Date
}

export interface VideoCallSession {
  id: string
  initiatorId: string
  participantId: string
  status: 'INITIATED' | 'RINGING' | 'ACTIVE' | 'ENDED' | 'DECLINED'
  startedAt?: Date
  endedAt?: Date
  duration?: number
  meetingUrl?: string
}

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  data?: Record<string, any>
  readAt?: Date
  createdAt: Date
}

export interface NotificationPreferences {
  email: {
    sessionReminders: boolean
    newMessages: boolean
    sessionUpdates: boolean
    weeklyDigest: boolean
  }
  inApp: {
    sessionReminders: boolean
    newMessages: boolean
    sessionUpdates: boolean
    mentorUpdates: boolean
  }
  sms: {
    sessionReminders: boolean
    urgentUpdates: boolean
  }
}

export interface ProfileUpdateData {
  firstName?: string
  lastName?: string
  bio?: string
  mentorProfile?: Partial<MentorProfile>
  studentProfile?: Partial<StudentProfile>
  privacySettings?: PrivacySettings
}

// Enums
export type UserRole = 'MENTOR' | 'STUDENT' | 'ADMIN'
export type SessionType = 'ONE_ON_ONE' | 'GROUP' | 'WORKSHOP' | 'WEBINAR'
export type SessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT'
export type MessageType = 'TEXT' | 'FILE' | 'IMAGE' | 'SYSTEM' | 'VIDEO_CALL'
export type NotificationType = 
  | 'SESSION_REMINDER' 
  | 'SESSION_CANCELLED' 
  | 'SESSION_UPDATED' 
  | 'NEW_MESSAGE' 
  | 'REGISTRATION_CONFIRMED' 
  | 'WAITLIST_PROMOTED'
  | 'MENTOR_AVAILABLE'
  | 'SYSTEM_UPDATE'

export type NotificationChannel = 'EMAIL' | 'IN_APP' | 'SMS'
export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

// API Response types
export interface ApiResponse<T> {
  data: T
  message?: string
  success: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasMore: boolean
  }
}

export interface SearchResult<T> {
  items: T[]
  total: number
  query: string
  filters?: Record<string, any>
}

// Form types
export interface FormErrors {
  [key: string]: string | undefined
}

export interface FormState<T> {
  values: T
  errors: FormErrors
  touched: { [K in keyof T]?: boolean }
  isSubmitting: boolean
  isValid: boolean
}

// Component prop types
export interface BaseComponentProps {
  className?: string
  children?: React.ReactNode
}

export interface LoadingState {
  isLoading: boolean
  error?: string | null
}

// Socket event types
export interface SocketEvents {
  // Message events
  'message:new': Message
  'message:read': { messageId: string; userId: string }
  'typing:start': { conversationId: string; userId: string }
  'typing:stop': { conversationId: string; userId: string }
  
  // User events
  'user:online': string
  'user:offline': string
  
  // Video call events
  'call:initiated': VideoCallSession
  'call:accepted': { callId: string }
  'call:declined': { callId: string }
  'call:ended': { callId: string }
  
  // Notification events
  'notification:new': Notification
  
  // Session events
  'session:updated': Session
  'session:cancelled': { sessionId: string }
  'session:reminder': { sessionId: string; minutesUntil: number }
}