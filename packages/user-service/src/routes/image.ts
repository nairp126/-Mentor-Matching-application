import { Router, Request, Response } from 'express';
import multer from 'multer';
import { ImageService } from '../services/imageService';
import { ProfileService } from '../services/profileService';
import { AuthUtils } from '@mentor-platform/shared';

const authMiddleware = AuthUtils.createAuthMiddleware();

const router = Router();
const imageService = new ImageService();
const profileService = new ProfileService();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (ImageService.isValidImageType(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'));
    }
  }
});

// Upload profile image
router.post('/profile', authMiddleware, upload.single('image'), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Upload and process image
    const uploadResult = await imageService.uploadProfileImage(
      userId,
      req.file.buffer,
      req.file.originalname
    );

    // Get current profile to check for existing image
    const currentProfile = await profileService.getProfile(userId);

    // Update profile with new image URL
    await profileService.updateProfile(userId, {
      profileImageUrl: uploadResult.url
    });

    // Delete old image if it exists
    if (currentProfile?.profile.profileImageUrl) {
      await imageService.deleteImage(currentProfile.profile.profileImageUrl);
    }

    res.status(201).json({
      message: 'Profile image uploaded successfully',
      image: uploadResult
    });
  } catch (error: any) {
    console.error('Image upload error:', error);

    if (error.message.includes('Invalid file type')) {
      return res.status(400).json({ error: error.message });
    }

    if (error.message.includes('too large') || error.message.includes('dimensions')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Image upload failed' });
  }
});

// Delete profile image
router.delete('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get current profile
    const currentProfile = await profileService.getProfile(userId);

    if (!currentProfile?.profile.profileImageUrl) {
      return res.status(404).json({ error: 'No profile image found' });
    }

    // Delete image file
    await imageService.deleteImage(currentProfile.profile.profileImageUrl);

    // Update profile to remove image URL
    await profileService.updateProfile(userId, {
      profileImageUrl: undefined
    });

    res.json({ message: 'Profile image deleted successfully' });
  } catch (error: any) {
    console.error('Image deletion error:', error);
    res.status(500).json({ error: 'Image deletion failed' });
  }
});

// Get image info (for debugging/admin purposes)
router.get('/info/:userId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.id;

    if (!requestingUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Only allow users to get info about their own images
    if (userId !== requestingUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const profile = await profileService.getProfile(userId);

    if (!profile?.profile.profileImageUrl) {
      return res.status(404).json({ error: 'No profile image found' });
    }

    res.json({
      imageUrl: profile.profile.profileImageUrl,
      hasImage: true
    });
  } catch (error: any) {
    console.error('Image info error:', error);
    res.status(500).json({ error: 'Failed to get image info' });
  }
});

// Error handling middleware for multer
router.use((error: any, req: Request, res: Response, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Only one file allowed.' });
    }
  }

  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({ error: error.message });
  }

  next(error);
});

export { router as imageRoutes };