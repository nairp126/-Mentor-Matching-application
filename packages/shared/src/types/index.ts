// Core entity types
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export type UserRole = 'MENTOR' | 'STUDENT' | 'ADMIN';

// Express Request extension
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: UserRole;
        permissions?: string[];
        email?: string;
        id?: string;
      };
    }
  }
}

export interface MentorProfile {
  userId: string;
  firstName: string;
  lastName: string;
  bio: string;
  expertiseAreas: string[];
  yearsOfExperience: number;
  hourlyRate?: number;
  availability: AvailabilitySlot[];
  profileImageUrl?: string;
  socialLinks: SocialLink[];
  rating: number;
  totalSessions: number;
}

export interface StudentProfile {
  userId: string;
  firstName: string;
  lastName: string;
  bio: string;
  learningGoals: string[];
  interests: string[];
  currentLevel: SkillLevel;
  profileImageUrl?: string;
  preferredSessionTypes: SessionType[];
}

export interface AvailabilitySlot {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  timezone: string;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type SessionType = 'ONE_ON_ONE' | 'GROUP' | 'WORKSHOP';
export type SessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Session {
  id: string;
  mentorId: string;
  title: string;
  description: string;
  expertiseAreas: string[];
  sessionType: SessionType;
  scheduledAt: Date;
  duration: number; // minutes
  capacity: number;
  currentRegistrations: number;
  registeredStudents: SessionRegistration[];
  waitlist: WaitlistEntry[];
  status: SessionStatus;
  meetingLink?: string;
  materials: SessionMaterial[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRegistration {
  studentId: string;
  registeredAt: Date;
  status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW';
}

export interface WaitlistEntry {
  studentId: string;
  addedAt: Date;
  position: number;
}

export interface SessionMaterial {
  id: string;
  name: string;
  url: string;
  type: 'DOCUMENT' | 'VIDEO' | 'LINK' | 'IMAGE';
  uploadedAt: Date;
}

// Communication types
export interface Conversation {
  id: string;
  participants: string[];
  lastMessage?: Message;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  fromUserId: string;
  content: string;
  type: MessageType;
  metadata?: Record<string, any>;
  createdAt: Date;
  editedAt?: Date;
}

export type MessageType = 'TEXT' | 'FILE' | 'IMAGE' | 'SYSTEM';

// Notification types
export interface NotificationData {
  type: NotificationType;
  title: string;
  message: string;
  channels: NotificationChannel[];
  priority: NotificationPriority;
  metadata?: Record<string, any>;
}

export type NotificationType = 
  | 'SESSION_REMINDER'
  | 'SESSION_CANCELLED'
  | 'NEW_MESSAGE'
  | 'REGISTRATION_CONFIRMED'
  | 'WAITLIST_PROMOTED'
  | 'REVIEW_REQUEST'
  | 'SYSTEM_ALERT';

export type NotificationChannel = 'EMAIL' | 'IN_APP' | 'SMS' | 'PUSH';
export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface NotificationPreferences {
  userId: string;
  channels: Record<NotificationType, NotificationChannel[]>;
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    timezone: string;
  };
}

// API types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Authentication types
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User; // Changed from UserProfile to User
}

export interface TokenValidation {
  valid: boolean;
  userId?: string;
  role?: UserRole;
  expiresAt?: Date;
}

export interface LoginCredentials {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface UserRegistration {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

// Matching types
export interface SessionRecommendation {
  session: Session;
  compatibilityScore: number;
  reasons: string[];
  mentor: MentorProfile;
}

export interface SearchQuery {
  query?: string;
  expertiseAreas?: string[];
  sessionType?: SessionType;
  dateRange?: {
    start: Date;
    end: Date;
  };
  priceRange?: {
    min: number;
    max: number;
  };
  rating?: number;
}

export interface MatchingFeedback {
  sessionId: string;
  helpful: boolean;
  reason?: string;
}

export interface MatchingPreferences {
  preferredExpertiseAreas: string[];
  preferredSessionTypes: SessionType[];
  preferredTimeSlots: AvailabilitySlot[];
  maxPrice?: number;
  minRating?: number;
}

// MFA types
export interface MFASetupResult {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface MFAVerificationRequest {
  code: string;
}

export interface MFAStatusResponse {
  enabled: boolean;
  backupCodesRemaining?: number;
}