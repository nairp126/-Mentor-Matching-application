import Joi from 'joi';

export const sessionCreateSchema = Joi.object({
  title: Joi.string().min(3).max(100).required(),
  description: Joi.string().min(10).max(1000).required(),
  expertiseAreas: Joi.array().items(Joi.string().min(1).max(50)).min(1).max(10).required(),
  sessionType: Joi.string().valid('ONE_ON_ONE', 'GROUP', 'WORKSHOP').required(),
  scheduledAt: Joi.date().greater('now').required(),
  duration: Joi.number().integer().min(15).max(480).required(), // 15 minutes to 8 hours
  capacity: Joi.number().integer().min(1).max(100).required(),
  meetingLink: Joi.string().uri().optional()
});

export const sessionUpdateSchema = Joi.object({
  title: Joi.string().min(3).max(100).optional(),
  description: Joi.string().min(10).max(1000).optional(),
  expertiseAreas: Joi.array().items(Joi.string().min(1).max(50)).min(1).max(10).optional(),
  sessionType: Joi.string().valid('ONE_ON_ONE', 'GROUP', 'WORKSHOP').optional(),
  scheduledAt: Joi.date().greater('now').optional(),
  duration: Joi.number().integer().min(15).max(480).optional(),
  capacity: Joi.number().integer().min(1).max(100).optional(),
  meetingLink: Joi.string().uri().allow('').optional()
});

export const sessionFiltersSchema = Joi.object({
  mentorId: Joi.string().uuid().optional(),
  studentId: Joi.string().uuid().optional(),
  expertiseAreas: Joi.array().items(Joi.string()).optional(),
  sessionType: Joi.string().valid('ONE_ON_ONE', 'GROUP', 'WORKSHOP').optional(),
  status: Joi.string().valid('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED').optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0)
});

export const recurringPatternSchema = Joi.object({
  title: Joi.string().min(3).max(100).required(),
  description: Joi.string().min(10).max(1000).required(),
  expertiseAreas: Joi.array().items(Joi.string().min(1).max(50)).min(1).max(10).required(),
  sessionType: Joi.string().valid('ONE_ON_ONE', 'GROUP', 'WORKSHOP').required(),
  duration: Joi.number().integer().min(15).max(480).required(),
  capacity: Joi.number().integer().min(1).max(100).required(),
  meetingLink: Joi.string().uri().optional(),
  frequency: Joi.string().valid('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY').required(),
  dayOfWeek: Joi.number().integer().min(0).max(6).when('frequency', {
    is: Joi.string().valid('WEEKLY', 'BIWEEKLY'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  timeOfDay: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  startDate: Joi.date().greater('now').required(),
  endDate: Joi.date().greater(Joi.ref('startDate')).optional(),
  maxSessions: Joi.number().integer().min(1).max(1000).optional(),
  timezone: Joi.string().required()
});

export const recurringPatternUpdateSchema = Joi.object({
  title: Joi.string().min(3).max(100).optional(),
  description: Joi.string().min(10).max(1000).optional(),
  expertiseAreas: Joi.array().items(Joi.string().min(1).max(50)).min(1).max(10).optional(),
  sessionType: Joi.string().valid('ONE_ON_ONE', 'GROUP', 'WORKSHOP').optional(),
  duration: Joi.number().integer().min(15).max(480).optional(),
  capacity: Joi.number().integer().min(1).max(100).optional(),
  meetingLink: Joi.string().uri().allow('').optional(),
  frequency: Joi.string().valid('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY').optional(),
  dayOfWeek: Joi.number().integer().min(0).max(6).optional(),
  timeOfDay: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  endDate: Joi.date().optional(),
  maxSessions: Joi.number().integer().min(1).max(1000).optional(),
  timezone: Joi.string().optional()
});

export const registrationStatusSchema = Joi.object({
  status: Joi.string().valid('CONFIRMED', 'CANCELLED', 'ATTENDED', 'NO_SHOW').required(),
  notes: Joi.string().max(500).optional()
});

export function validateSessionCreate(data: any) {
  return sessionCreateSchema.validate(data);
}

export function validateSessionUpdate(data: any) {
  return sessionUpdateSchema.validate(data);
}

export function validateSessionFilters(data: any) {
  return sessionFiltersSchema.validate(data);
}

export function validateRecurringPattern(data: any) {
  return recurringPatternSchema.validate(data);
}

export function validateRecurringPatternUpdate(data: any) {
  return recurringPatternUpdateSchema.validate(data);
}

export function validateRegistrationStatus(data: any) {
  return registrationStatusSchema.validate(data);
}