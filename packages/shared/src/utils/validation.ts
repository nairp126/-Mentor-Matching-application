import Joi from 'joi';
import { UserRole, SessionType, SkillLevel, NotificationChannel, NotificationPriority } from '../types';

// User validation schemas
export const userRegistrationSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    }),
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  role: Joi.string().valid(...Object.values(['MENTOR', 'STUDENT'] as UserRole[])).required(),
  acceptTerms: Joi.boolean().required() // Allow acceptTerms from frontend
});

export const loginCredentialsSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  mfaCode: Joi.string().length(6).pattern(/^\d+$/).optional()
});

// Profile validation schemas
export const mentorProfileSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  bio: Joi.string().max(1000).required(),
  expertiseAreas: Joi.array().items(Joi.string().min(2).max(50)).min(1).max(10).required(),
  yearsOfExperience: Joi.number().integer().min(0).max(50).required(),
  hourlyRate: Joi.number().positive().max(1000).optional(),
  availability: Joi.array().items(Joi.object({
    dayOfWeek: Joi.number().integer().min(0).max(6).required(),
    startTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    endTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    timezone: Joi.string().required()
  })).required(),
  socialLinks: Joi.array().items(Joi.object({
    platform: Joi.string().required(),
    url: Joi.string().uri().required()
  })).max(5).optional()
});

export const studentProfileSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  bio: Joi.string().max(1000).required(),
  learningGoals: Joi.array().items(Joi.string().min(2).max(100)).min(1).max(10).required(),
  interests: Joi.array().items(Joi.string().min(2).max(50)).min(1).max(10).required(),
  currentLevel: Joi.string().valid(...Object.values(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as SkillLevel[])).required(),
  preferredSessionTypes: Joi.array().items(Joi.string().valid(...Object.values(['ONE_ON_ONE', 'GROUP', 'WORKSHOP'] as SessionType[]))).min(1).required()
});

// Session validation schemas
export const sessionSchema = Joi.object({
  title: Joi.string().min(5).max(100).required(),
  description: Joi.string().min(10).max(2000).required(),
  expertiseAreas: Joi.array().items(Joi.string().min(2).max(50)).min(1).max(5).required(),
  sessionType: Joi.string().valid(...Object.values(['ONE_ON_ONE', 'GROUP', 'WORKSHOP'] as SessionType[])).required(),
  scheduledAt: Joi.date().greater('now').required(),
  duration: Joi.number().integer().min(15).max(480).required(), // 15 minutes to 8 hours
  capacity: Joi.number().integer().min(1).max(100).required(),
  meetingLink: Joi.string().uri().optional()
});

// Notification validation schemas
export const notificationPreferencesSchema = Joi.object({
  channels: Joi.object().pattern(
    Joi.string(),
    Joi.array().items(Joi.string().valid(...Object.values(['EMAIL', 'IN_APP', 'SMS', 'PUSH'] as NotificationChannel[])))
  ).required(),
  quietHours: Joi.object({
    enabled: Joi.boolean().required(),
    startTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    endTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    timezone: Joi.string().required()
  }).required()
});

// Message validation schemas
export const messageSchema = Joi.object({
  content: Joi.string().min(1).max(2000).required(),
  type: Joi.string().valid('TEXT', 'FILE', 'IMAGE', 'SYSTEM').default('TEXT'),
  metadata: Joi.object().optional()
});

// Search validation schemas
export const searchQuerySchema = Joi.object({
  query: Joi.string().min(2).max(100).optional(),
  expertiseAreas: Joi.array().items(Joi.string().min(2).max(50)).max(10).optional(),
  sessionType: Joi.string().valid(...Object.values(['ONE_ON_ONE', 'GROUP', 'WORKSHOP'] as SessionType[])).optional(),
  dateRange: Joi.object({
    start: Joi.date().required(),
    end: Joi.date().greater(Joi.ref('start')).required()
  }).optional(),
  priceRange: Joi.object({
    min: Joi.number().min(0).required(),
    max: Joi.number().greater(Joi.ref('min')).required()
  }).optional(),
  rating: Joi.number().min(1).max(5).optional()
});

// Pagination validation schema
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

// MFA validation schemas
export const mfaVerificationSchema = Joi.object({
  code: Joi.string().length(6).pattern(/^\d+$/).required()
    .messages({
      'string.length': 'MFA code must be exactly 6 digits',
      'string.pattern.base': 'MFA code must contain only digits'
    })
});

export const mfaBackupCodeSchema = Joi.object({
  code: Joi.string().length(8).pattern(/^[A-Z0-9]+$/).required()
    .messages({
      'string.length': 'Backup code must be exactly 8 characters',
      'string.pattern.base': 'Backup code must contain only uppercase letters and numbers'
    })
});

export const mfaCodeSchema = Joi.object({
  code: Joi.alternatives().try(
    Joi.string().length(6).pattern(/^\d+$/), // TOTP code
    Joi.string().length(8).pattern(/^[A-Z0-9]+$/) // Backup code
  ).required()
    .messages({
      'alternatives.match': 'Code must be either a 6-digit TOTP code or an 8-character backup code'
    })
});

// Utility functions for validation
export const validateSchema = <T>(schema: Joi.ObjectSchema, data: unknown): { value: T; error?: Joi.ValidationError } => {
  const result = schema.validate(data, { abortEarly: false, stripUnknown: true });
  return {
    value: result.value as T,
    error: result.error
  };
};

export const createValidationMiddleware = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any): void => {
    const { error, value } = validateSchema(schema, req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        },
        timestamp: new Date().toISOString()
      });
    }
    req.body = value;
    next();
  };
};