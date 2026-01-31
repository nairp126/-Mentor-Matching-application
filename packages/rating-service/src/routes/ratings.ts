import { Router } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import Joi from 'joi';
import { RatingService } from '../services/ratingService';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validation';
import { ApiResponse } from '@mentor-platform/shared';

export function createRatingRoutes(
  db: Pool,
  redis: Redis,
  ratingService: RatingService
): Router {
  const router = Router();

  // Validation schemas
  const submitRatingSchema = Joi.object({
    sessionId: Joi.string().uuid().required(),
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().max(1000).optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
    isAnonymous: Joi.boolean().default(false)
  });

  const createPromptsSchema = Joi.object({
    sessionId: Joi.string().uuid().required(),
    mentorId: Joi.string().uuid().required(),
    studentIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
    sessionTitle: Joi.string().min(1).max(200).required(),
    sessionDate: Joi.date().iso().required(),
    duration: Joi.number().integer().min(1).required()
  });

  /**
   * Submit a rating and review
   * POST /api/ratings/submit
   */
  router.post('/submit',
    authMiddleware,
    validateRequest(submitRatingSchema),
    async (req, res) => {
      try {
        const userId = req.user!.userId;
        const { sessionId, rating, comment, tags, isAnonymous } = req.body;

        // Verify user participated in the session
        const participationQuery = `
          SELECT 1 FROM sessions s
          LEFT JOIN session_registrations sr ON s.id = sr.session_id
          WHERE s.id = $1 
            AND (s.mentor_id = $2 OR (sr.student_id = $2 AND sr.status = 'CONFIRMED'))
        `;

        const participationResult = await db.query(participationQuery, [sessionId, userId]);

        if (participationResult.rows.length === 0) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You can only rate sessions you participated in'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const review = await ratingService.submitRating(
          req.user!.userId,
          sessionId,
          rating,
          comment,
          tags,
          isAnonymous
        );

        res.json({
          success: true,
          data: {
            review,
            message: 'Rating submitted successfully'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error submitting rating:', error);

        if (error instanceof Error && error.message.includes('already exists')) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'CONFLICT',
              message: error.message
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to submit rating'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Create post-session rating prompts
   * POST /api/ratings/prompts
   */
  router.post('/prompts',
    authMiddleware,
    validateRequest(createPromptsSchema),
    async (req, res) => {
      try {
        // Only mentors and admins can create rating prompts
        if (req.user?.role !== 'MENTOR' && req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only mentors can create rating prompts'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const sessionData = req.body;

        // If user is a mentor, verify they own the session
        if (req.user.role === 'MENTOR' && req.user.id !== sessionData.mentorId) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You can only create prompts for your own sessions'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const promptIds = await ratingService.createPostSessionRatingPrompts({
          ...sessionData,
          sessionDate: new Date(sessionData.sessionDate)
        });

        res.json({
          success: true,
          data: {
            promptIds,
            count: promptIds.length,
            message: 'Rating prompts created successfully'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error creating rating prompts:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to create rating prompts'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get pending rating prompts for current user
   * GET /api/ratings/prompts/pending
   */
  router.get('/prompts/pending',
    authMiddleware,
    async (req, res) => {
      try {
        const userId = req.user!.userId;
        const prompts = await ratingService.getPendingRatingPrompts(userId);

        res.json({
          success: true,
          data: {
            prompts,
            count: prompts.length
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting pending rating prompts:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get pending rating prompts'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Dismiss a rating prompt
   * PUT /api/ratings/prompts/:id/dismiss
   */
  router.put('/prompts/:id/dismiss',
    authMiddleware,
    async (req, res) => {
      try {
        const userId = req.user!.userId;
        const promptId = req.params.id;

        await ratingService.dismissRatingPrompt(promptId, userId);

        res.json({
          success: true,
          data: {
            message: 'Rating prompt dismissed successfully'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error dismissing rating prompt:', error);

        if (error instanceof Error && error.message.includes('not found')) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: error.message
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to dismiss rating prompt'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get rating statistics for a user
   * GET /api/ratings/stats/:userId
   */
  router.get('/stats/:userId',
    authMiddleware,
    async (req, res) => {
      try {
        const targetUserId = req.params.userId;
        const requestingUserId = req.user!.id;

        // Users can view their own stats, or anyone can view mentor stats
        const canViewStats = targetUserId === requestingUserId || req.user?.role === 'ADMIN';

        if (!canViewStats) {
          // Check if target user is a mentor (public stats)
          const mentorQuery = `
            SELECT 1 FROM mentor_profiles WHERE user_id = $1
          `;
          const mentorResult = await db.query(mentorQuery, [targetUserId]);

          if (mentorResult.rows.length === 0) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'You can only view your own rating statistics'
              },
              timestamp: new Date().toISOString()
            } as ApiResponse);
          }
        }

        const stats = await ratingService.getRatingStats(targetUserId);

        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting rating statistics:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get rating statistics'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get reviews for a user
   * GET /api/ratings/reviews/:userId
   */
  router.get('/reviews/:userId',
    authMiddleware,
    async (req, res) => {
      try {
        const targetUserId = req.params.userId;
        const requestingUserId = req.user!.id;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;
        const includeAnonymous = req.query.includeAnonymous === 'true';

        // Users can view their own reviews with anonymous ones, others see public reviews only
        const canViewAnonymous = targetUserId === requestingUserId || req.user?.role === 'ADMIN';
        const finalIncludeAnonymous = includeAnonymous && canViewAnonymous;

        // Check if target user is a mentor for public access
        if (targetUserId !== requestingUserId && req.user?.role !== 'ADMIN') {
          const mentorQuery = `
            SELECT 1 FROM mentor_profiles WHERE user_id = $1
          `;
          const mentorResult = await db.query(mentorQuery, [targetUserId]);

          if (mentorResult.rows.length === 0) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'You can only view reviews for mentors or your own reviews'
              },
              timestamp: new Date().toISOString()
            } as ApiResponse);
          }
        }

        const result = await ratingService.getReviews(
          targetUserId,
          limit,
          offset,
          finalIncludeAnonymous
        );

        res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting reviews:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get reviews'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get rating prompt statistics (admin only)
   * GET /api/ratings/prompts/stats
   */
  router.get('/prompts/stats',
    authMiddleware,
    async (req, res) => {
      try {
        if (req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only administrators can view rating prompt statistics'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const stats = await ratingService.getRatingPromptStats();

        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting rating prompt statistics:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get rating prompt statistics'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Process scheduled rating prompts (admin only)
   * POST /api/ratings/prompts/process
   */
  router.post('/prompts/process',
    authMiddleware,
    async (req, res) => {
      try {
        if (req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only administrators can process rating prompts'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        await ratingService.processScheduledRatingPrompts();

        res.json({
          success: true,
          data: {
            message: 'Rating prompts processed successfully'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error processing rating prompts:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to process rating prompts'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Expire old rating prompts (admin only)
   * POST /api/ratings/prompts/expire
   */
  router.post('/prompts/expire',
    authMiddleware,
    async (req, res) => {
      try {
        if (req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only administrators can expire rating prompts'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const expiredCount = await ratingService.expireOldRatingPrompts();

        res.json({
          success: true,
          data: {
            expiredCount,
            message: 'Old rating prompts expired successfully'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error expiring rating prompts:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to expire rating prompts'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  return router;
}