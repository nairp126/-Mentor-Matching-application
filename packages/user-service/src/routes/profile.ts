import { Router, Request, Response } from 'express';
import { ProfileService } from '../services/profileService';
import {
  validateProfileData,
  validateProfileUpdate,
  validateSearchCriteria
} from '../validation/profileValidation';
import { AuthUtils } from '@mentor-platform/shared';

const authMiddleware = AuthUtils.createAuthMiddleware();
const router = Router();
const profileService = new ProfileService();

// Create user profile
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate profile data based on user role
    const { error, value } = validateProfileData(req.body, userRole);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const profile = await profileService.createProfile(userId, value);
    res.status(201).json(profile);
  } catch (error: any) {
    console.error('Profile creation error:', error);

    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }

    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({ error: 'Profile already exists' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile
router.get('/:userId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.id;

    if (!requestingUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const profile = await profileService.getProfile(userId);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // TODO: Apply privacy settings here
    // For now, return full profile if it's the user's own profile
    // or a limited version for others

    if (userId === requestingUserId) {
      res.json(profile);
    } else {
      // Return limited profile for other users
      const limitedProfile = {
        id: profile.id,
        role: profile.role,
        profile: {
          ...profile.profile,
          // Remove sensitive information
          email: undefined
        },
        createdAt: profile.createdAt
      };
      res.json(limitedProfile);
    }
  } catch (error: any) {
    console.error('Profile retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/:userId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.id;

    if (!requestingUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Users can only update their own profiles
    if (userId !== requestingUserId) {
      return res.status(403).json({ error: 'Forbidden: Can only update own profile' });
    }

    // Validate update data
    const { error, value } = validateProfileUpdate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const updatedProfile = await profileService.updateProfile(userId, value);
    res.json(updatedProfile);
  } catch (error: any) {
    console.error('Profile update error:', error);

    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search users
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const requestingUserId = req.user?.id;

    if (!requestingUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate search criteria
    const { error, value } = validateSearchCriteria(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const users = await profileService.searchUsers(value);

    // Return limited profiles for search results
    const limitedUsers = users.map(user => ({
      id: user.id,
      role: user.role,
      profile: {
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        bio: user.profile.bio,
        ...(user.role === 'MENTOR' && {
          expertiseAreas: (user.profile as any).expertiseAreas,
          rating: (user.profile as any).rating,
          totalSessions: (user.profile as any).totalSessions
        }),
        ...(user.role === 'STUDENT' && {
          interests: (user.profile as any).interests,
          currentLevel: (user.profile as any).currentLevel
        })
      },
      createdAt: user.createdAt
    }));

    res.json({
      users: limitedUsers,
      total: limitedUsers.length,
      limit: value.limit,
      offset: value.offset
    });
  } catch (error: any) {
    console.error('User search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as profileRoutes };