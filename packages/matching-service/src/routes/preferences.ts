import { Router, Request, Response } from 'express';
import { MatchingService, MatchingPreferences } from '../services/matchingService';
import { AuthUtils } from '@mentor-platform/shared';
import Joi from 'joi';

const router = Router();
const matchingService = new MatchingService();
const authMiddleware = AuthUtils.createAuthMiddleware();

// Validation schemas
const timeSlotSchema = Joi.object({
  dayOfWeek: Joi.number().integer().min(0).max(6).required(),
  startTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  endTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  timezone: Joi.string().required()
});

const preferencesSchema = Joi.object({
  preferredExpertiseAreas: Joi.array().items(Joi.string().max(100)).max(20).optional(),
  preferredSessionTypes: Joi.array().items(Joi.string().valid('ONE_ON_ONE', 'GROUP', 'WORKSHOP')).max(3).optional(),
  preferredTimeSlots: Joi.array().items(timeSlotSchema).max(14).optional(), // Max 2 slots per day
  maxTravelTime: Joi.number().min(0).max(180).optional(), // Max 3 hours
  minMentorRating: Joi.number().min(1).max(5).optional(),
  preferredMentorExperience: Joi.string().valid('ANY', 'JUNIOR', 'SENIOR', 'EXPERT').optional(),
  sessionFrequency: Joi.string().valid('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'FLEXIBLE').optional(),
  learningStyle: Joi.string().valid('VISUAL', 'AUDITORY', 'KINESTHETIC', 'MIXED').optional()
});

// Get user's matching preferences
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get preferences from the matching service
    const preferences = await matchingService.getMatchingPreferences(userId);
    
    if (!preferences) {
      return res.json({
        success: true,
        data: {
          preferences: null,
          message: 'No preferences set. Default matching will be used.'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: {
        preferences
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Get preferences error:', error);
    res.status(500).json({ 
      success: false,
      error: {
        code: 'PREFERENCES_ERROR',
        message: 'Failed to retrieve preferences'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Update user's matching preferences
router.put('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate preferences data
    const { error, value } = preferencesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }

    // Validate time slot logic
    if (value.preferredTimeSlots) {
      for (const slot of value.preferredTimeSlots) {
        if (slot.startTime >= slot.endTime) {
          return res.status(400).json({
            error: 'Invalid time slot: start time must be before end time'
          });
        }
      }
    }

    const updatedPreferences = await matchingService.updatePreferences(userId, value);
    
    res.json({
      success: true,
      data: {
        preferences: updatedPreferences,
        message: 'Preferences updated successfully'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Update preferences error:', error);
    res.status(500).json({ 
      success: false,
      error: {
        code: 'PREFERENCES_UPDATE_ERROR',
        message: 'Failed to update preferences'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Reset preferences to defaults
router.delete('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Reset to empty preferences (will use defaults)
    const defaultPreferences: Partial<MatchingPreferences> = {
      preferredExpertiseAreas: [],
      preferredSessionTypes: [],
      preferredTimeSlots: [],
      maxTravelTime: undefined,
      minMentorRating: undefined,
      preferredMentorExperience: undefined,
      sessionFrequency: undefined,
      learningStyle: undefined
    };

    const updatedPreferences = await matchingService.updatePreferences(userId, defaultPreferences);
    
    res.json({
      success: true,
      data: {
        preferences: updatedPreferences,
        message: 'Preferences reset to defaults'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Reset preferences error:', error);
    res.status(500).json({ 
      success: false,
      error: {
        code: 'PREFERENCES_RESET_ERROR',
        message: 'Failed to reset preferences'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Get preference recommendations based on user history
router.get('/recommendations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // This would analyze user's session history to suggest preferences
    // For now, return some basic recommendations
    const recommendations = {
      expertiseAreas: [
        'Based on your recent sessions, you might be interested in JavaScript and React'
      ],
      sessionTypes: [
        'You seem to prefer ONE_ON_ONE sessions based on your history'
      ],
      timeSlots: [
        'You typically book sessions on weekday evenings'
      ],
      mentorExperience: [
        'You tend to book with SENIOR level mentors'
      ]
    };
    
    res.json({
      success: true,
      data: {
        recommendations,
        message: 'Preference recommendations based on your activity'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Preference recommendations error:', error);
    res.status(500).json({ 
      success: false,
      error: {
        code: 'RECOMMENDATIONS_ERROR',
        message: 'Failed to get preference recommendations'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export { router as preferencesRoutes };