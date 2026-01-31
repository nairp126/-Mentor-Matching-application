import Joi from 'joi';

export const mentorProfileSchema = Joi.object({
  firstName: Joi.string().min(1).max(50).required(),
  lastName: Joi.string().min(1).max(50).required(),
  bio: Joi.string().min(10).max(1000).required(),
  expertiseAreas: Joi.array().items(Joi.string().min(1).max(50)).min(1).max(10).required(),
  yearsOfExperience: Joi.number().integer().min(0).max(50).required(),
  hourlyRate: Joi.number().min(0).max(1000).optional(),
  availability: Joi.array().items(
    Joi.object({
      dayOfWeek: Joi.number().integer().min(0).max(6).required(),
      startTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      endTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      timezone: Joi.string().required()
    })
  ).optional(),
  profileImageUrl: Joi.string().uri().optional(),
  socialLinks: Joi.array().items(
    Joi.object({
      platform: Joi.string().valid('linkedin', 'twitter', 'github', 'website').required(),
      url: Joi.string().uri().required()
    })
  ).max(5).optional()
});

export const studentProfileSchema = Joi.object({
  firstName: Joi.string().min(1).max(50).required(),
  lastName: Joi.string().min(1).max(50).required(),
  bio: Joi.string().min(10).max(1000).required(),
  learningGoals: Joi.array().items(Joi.string().min(1).max(100)).min(1).max(10).required(),
  interests: Joi.array().items(Joi.string().min(1).max(50)).min(1).max(20).required(),
  currentLevel: Joi.string().valid('BEGINNER', 'INTERMEDIATE', 'ADVANCED').required(),
  profileImageUrl: Joi.string().uri().optional(),
  preferredSessionTypes: Joi.array().items(
    Joi.string().valid('ONE_ON_ONE', 'GROUP', 'WORKSHOP')
  ).optional()
});

export const profileUpdateSchema = Joi.object({
  firstName: Joi.string().min(1).max(50).optional(),
  lastName: Joi.string().min(1).max(50).optional(),
  bio: Joi.string().min(10).max(1000).optional(),
  expertiseAreas: Joi.array().items(Joi.string().min(1).max(50)).min(1).max(10).optional(),
  yearsOfExperience: Joi.number().integer().min(0).max(50).optional(),
  hourlyRate: Joi.number().min(0).max(1000).optional(),
  availability: Joi.array().items(
    Joi.object({
      dayOfWeek: Joi.number().integer().min(0).max(6).required(),
      startTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      endTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      timezone: Joi.string().required()
    })
  ).optional(),
  profileImageUrl: Joi.string().uri().optional(),
  socialLinks: Joi.array().items(
    Joi.object({
      platform: Joi.string().valid('linkedin', 'twitter', 'github', 'website').required(),
      url: Joi.string().uri().required()
    })
  ).max(5).optional(),
  learningGoals: Joi.array().items(Joi.string().min(1).max(100)).min(1).max(10).optional(),
  interests: Joi.array().items(Joi.string().min(1).max(50)).min(1).max(20).optional(),
  currentLevel: Joi.string().valid('BEGINNER', 'INTERMEDIATE', 'ADVANCED').optional(),
  preferredSessionTypes: Joi.array().items(
    Joi.string().valid('ONE_ON_ONE', 'GROUP', 'WORKSHOP')
  ).optional()
});

export const searchCriteriaSchema = Joi.object({
  role: Joi.string().valid('MENTOR', 'STUDENT').optional(),
  expertiseAreas: Joi.array().items(Joi.string()).optional(),
  searchTerm: Joi.string().min(1).max(100).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0)
});

export function validateProfileData(data: any, userRole: string) {
  if (userRole === 'MENTOR') {
    return mentorProfileSchema.validate(data);
  } else {
    return studentProfileSchema.validate(data);
  }
}

export function validateProfileUpdate(data: any) {
  return profileUpdateSchema.validate(data);
}

export function validateSearchCriteria(data: any) {
  return searchCriteriaSchema.validate(data);
}