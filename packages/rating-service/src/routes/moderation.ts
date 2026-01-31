import { Router } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import Joi from 'joi';
import { ReviewValidationService } from '../services/reviewValidationService';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validation';
import { ApiResponse } from '@mentor-platform/shared';

export function createModerationRoutes(
  db: Pool,
  redis: Redis,
  reviewValidationService: ReviewValidationService
): Router {
  const router = Router();

  // Validation schemas
  const validateReviewSchema = Joi.object({
    content: Joi.string().min(1).max(1000).required(),
    rating: Joi.number().integer().min(1).max(5).required(),
    sessionId: Joi.string().uuid().required()
  });

  const moderationActionSchema = Joi.object({
    action: Joi.string().valid('APPROVE', 'REJECT', 'EDIT', 'FLAG', 'REQUEST_CLARIFICATION').required(),
    reason: Joi.string().min(1).max(500).required(),
    editedContent: Joi.string().max(1000).optional()
  });

  /**
   * Validate review content before submission
   * POST /api/moderation/validate
   */
  router.post('/validate',
    authMiddleware,
    validateRequest(validateReviewSchema),
    async (req, res) => {
      try {
        const userId = req.user!.id;
        const { content, rating, sessionId } = req.body;

        // Validate review content
        const validationResult = await reviewValidationService.validateReview(
          content,
          rating,
          sessionId,
          req.user!.userId
        );

        // Validate association
        const associationResult = await reviewValidationService.validateReviewAssociation(
          req.user!.userId,
          sessionId
        );

        res.json({
          success: true,
          data: {
            validation: validationResult,
            association: associationResult,
            canSubmit: validationResult.isValid && associationResult.isValidAssociation
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error validating review:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to validate review'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get reviews pending moderation (moderator/admin only)
   * GET /api/moderation/pending
   */
  router.get('/pending',
    authMiddleware,
    async (req, res) => {
      try {
        // Only moderators and admins can view pending reviews
        if (req.user?.role !== 'ADMIN') {
          // Check if user has moderator role (you might have a separate moderator role)
          const moderatorQuery = `
            SELECT 1 FROM users 
            WHERE id = $1 AND (role = 'ADMIN' OR metadata->>'isModerator' = 'true')
          `;
          const moderatorResult = await db.query(moderatorQuery, [req.user!.id]);

          if (moderatorResult.rows.length === 0) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'Only moderators can view pending reviews'
              },
              timestamp: new Date().toISOString()
            } as ApiResponse);
          }
        }

        const limit = parseInt(req.query.limit as string) || 50;
        const priority = req.query.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | undefined;

        const pendingReviews = await reviewValidationService.getPendingModerationReviews(
          limit,
          priority
        );

        res.json({
          success: true,
          data: {
            reviews: pendingReviews,
            count: pendingReviews.length
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting pending moderation reviews:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get pending moderation reviews'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Process moderation action (moderator/admin only)
   * POST /api/moderation/reviews/:reviewId/action
   */
  router.post('/reviews/:reviewId/action',
    authMiddleware,
    validateRequest(moderationActionSchema),
    async (req, res) => {
      try {
        // Only moderators and admins can process moderation actions
        if (req.user?.role !== 'ADMIN') {
          const moderatorQuery = `
            SELECT 1 FROM users 
            WHERE id = $1 AND (role = 'ADMIN' OR metadata->>'isModerator' = 'true')
          `;
          const moderatorResult = await db.query(moderatorQuery, [req.user!.id]);

          if (moderatorResult.rows.length === 0) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'Only moderators can process moderation actions'
              },
              timestamp: new Date().toISOString()
            } as ApiResponse);
          }
        }

        const reviewId = req.params.reviewId;
        const { action, reason, editedContent } = req.body;
        const moderatorId = req.user!.userId;

        const moderationAction = await reviewValidationService.processModerationAction(
          reviewId,
          moderatorId,
          action,
          reason,
          editedContent
        );

        res.json({
          success: true,
          data: {
            action: moderationAction,
            message: 'Moderation action processed successfully'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error processing moderation action:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to process moderation action'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Submit review for moderation
   * POST /api/moderation/reviews/:reviewId/submit
   */
  router.post('/reviews/:reviewId/submit',
    authMiddleware,
    validateRequest(Joi.object({
      violations: Joi.array().items(Joi.object({
        type: Joi.string().valid('PROFANITY', 'SPAM', 'INAPPROPRIATE', 'OFF_TOPIC', 'PERSONAL_INFO', 'FAKE').required(),
        severity: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').required(),
        description: Joi.string().required(),
        location: Joi.string().optional()
      })).required(),
      priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT').default('MEDIUM')
    })),
    async (req, res) => {
      try {
        const reviewId = req.params.reviewId;
        const { violations, priority } = req.body;

        // Verify user has permission to submit this review for moderation
        // (either the reviewer, reviewee, or admin)
        const reviewQuery = `
          SELECT reviewer_id, reviewee_id FROM reviews WHERE id = $1
        `;
        const reviewResult = await db.query(reviewQuery, [reviewId]);

        if (reviewResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Review not found'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const review = reviewResult.rows[0];
        const canSubmit = req.user?.role === 'ADMIN' ||
          req.user?.id === review.reviewer_id ||
          req.user?.id === review.reviewee_id;

        if (!canSubmit) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You can only submit your own reviews or reviews about you for moderation'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const moderationId = await reviewValidationService.submitForModeration(
          reviewId,
          violations,
          priority
        );

        res.json({
          success: true,
          data: {
            moderationId,
            message: 'Review submitted for moderation successfully'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error submitting review for moderation:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to submit review for moderation'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get moderation statistics (admin only)
   * GET /api/moderation/stats
   */
  router.get('/stats',
    authMiddleware,
    async (req, res) => {
      try {
        if (req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only administrators can view moderation statistics'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const stats = await reviewValidationService.getModerationStats();

        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting moderation statistics:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get moderation statistics'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Validate review association
   * GET /api/moderation/validate-association/:sessionId
   */
  router.get('/validate-association/:sessionId',
    authMiddleware,
    async (req, res) => {
      try {
        const sessionId = req.params.sessionId;
        const userId = req.user!.userId;

        const association = await reviewValidationService.validateReviewAssociation(
          userId,
          sessionId
        );

        res.json({
          success: true,
          data: association,
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error validating review association:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to validate review association'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  return router;
}