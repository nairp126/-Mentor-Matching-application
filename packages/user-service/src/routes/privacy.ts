import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { PrivacyService } from '../services/privacyService';
import { AuthUtils } from '@mentor-platform/shared';

const authMiddleware = AuthUtils.createAuthMiddleware();
const router = Router();
const privacyService = new PrivacyService();

// Privacy settings validation schema
const privacyUpdateSchema = Joi.object({
  profileVisibility: Joi.string().valid('PUBLIC', 'PRIVATE', 'MENTORS_ONLY', 'STUDENTS_ONLY').optional(),
  showEmail: Joi.boolean().optional(),
  showSocialLinks: Joi.boolean().optional(),
  showAvailability: Joi.boolean().optional(),
  allowDirectMessages: Joi.boolean().optional(),
  allowSessionInvites: Joi.boolean().optional(),
  searchable: Joi.boolean().optional(),
  showInRecommendations: Joi.boolean().optional()
});

// Get privacy settings
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const privacySettings = await privacyService.getPrivacySettings(userId);
    res.json(privacySettings);
  } catch (error: any) {
    console.error('Privacy settings retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update privacy settings
router.put('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate update data
    const { error, value } = privacyUpdateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const updatedSettings = await privacyService.updatePrivacySettings(userId, value);
    res.json(updatedSettings);
  } catch (error: any) {
    console.error('Privacy settings update error:', error);

    if (error.message === 'Privacy settings not found') {
      return res.status(404).json({ error: 'Privacy settings not found' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if user can view another user's profile
router.get('/can-view/:targetUserId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const viewerUserId = req.user?.id;
    const { targetUserId } = req.params;

    if (!viewerUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get target user's role (needed for privacy check)
    // This would typically come from a user service call
    const targetUserRole = 'MENTOR'; // Placeholder - should be fetched from database

    const canView = await privacyService.canViewProfile(viewerUserId, targetUserId, targetUserRole);

    res.json({ canView });
  } catch (error: any) {
    console.error('Privacy check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if user can send direct message
router.get('/can-message/:recipientUserId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const senderUserId = req.user?.id;
    const { recipientUserId } = req.params;

    if (!senderUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const canMessage = await privacyService.canSendDirectMessage(senderUserId, recipientUserId);

    res.json({ canMessage });
  } catch (error: any) {
    console.error('Privacy check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if user can send session invite
router.get('/can-invite/:recipientUserId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const senderUserId = req.user?.id;
    const { recipientUserId } = req.params;

    if (!senderUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const canInvite = await privacyService.canSendSessionInvite(senderUserId, recipientUserId);

    res.json({ canInvite });
  } catch (error: any) {
    console.error('Privacy check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get privacy-filtered profile (utility endpoint for other services)
router.post('/filter-profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const viewerUserId = req.user?.id;
    const { targetProfile } = req.body;

    if (!viewerUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!targetProfile) {
      return res.status(400).json({ error: 'Target profile required' });
    }

    const filteredProfile = await privacyService.applyPrivacyFilter(viewerUserId, targetProfile);

    res.json(filteredProfile);
  } catch (error: any) {
    console.error('Profile filtering error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as privacyRoutes };