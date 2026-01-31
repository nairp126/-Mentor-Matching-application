import { Router } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { RatingAnalyticsService } from '../services/ratingAnalyticsService';
import { authMiddleware } from '../middleware/authMiddleware';
import { ApiResponse } from '@mentor-platform/shared';

export function createAnalyticsRoutes(
  db: Pool,
  redis: Redis,
  ratingAnalyticsService: RatingAnalyticsService
): Router {
  const router = Router();

  /**
   * Get detailed rating statistics with analytics
   * GET /api/analytics/detailed-stats/:userId
   */
  router.get('/detailed-stats/:userId',
    authMiddleware,
    async (req, res) => {
      try {
        const targetUserId = req.params.userId;
        const requestingUserId = req.user!.id;

        // Users can view their own detailed stats, admins can view anyone's
        if (targetUserId !== requestingUserId && req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You can only view your own detailed rating statistics'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const stats = await ratingAnalyticsService.getDetailedRatingStats(targetUserId);

        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting detailed rating statistics:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get detailed rating statistics'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get rating insights and recommendations
   * GET /api/analytics/insights/:userId
   */
  router.get('/insights/:userId',
    authMiddleware,
    async (req, res) => {
      try {
        const targetUserId = req.params.userId;
        const requestingUserId = req.user!.id;

        // Users can view their own insights, admins can view anyone's
        if (targetUserId !== requestingUserId && req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You can only view your own rating insights'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const insights = await ratingAnalyticsService.generateRatingInsights(targetUserId);

        res.json({
          success: true,
          data: insights,
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error generating rating insights:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to generate rating insights'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get rating velocity analysis
   * GET /api/analytics/velocity/:userId
   */
  router.get('/velocity/:userId',
    authMiddleware,
    async (req, res) => {
      try {
        const targetUserId = req.params.userId;
        const requestingUserId = req.user!.id;

        // Users can view their own velocity, admins can view anyone's
        if (targetUserId !== requestingUserId && req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You can only view your own rating velocity'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const velocity = await ratingAnalyticsService.calculateRatingVelocity(targetUserId);

        res.json({
          success: true,
          data: velocity,
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error calculating rating velocity:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to calculate rating velocity'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get leaderboard position
   * GET /api/analytics/leaderboard/:userId
   */
  router.get('/leaderboard/:userId',
    authMiddleware,
    async (req, res) => {
      try {
        const targetUserId = req.params.userId;
        const requestingUserId = req.user!.id;

        // Users can view their own position, mentors' positions are public
        if (targetUserId !== requestingUserId && req.user?.role !== 'ADMIN') {
          // Check if target user is a mentor (public leaderboard position)
          const mentorQuery = `
            SELECT 1 FROM mentor_profiles WHERE user_id = $1
          `;
          const mentorResult = await db.query(mentorQuery, [targetUserId]);
          
          if (mentorResult.rows.length === 0) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'You can only view leaderboard positions for mentors'
              },
              timestamp: new Date().toISOString()
            } as ApiResponse);
          }
        }

        const position = await ratingAnalyticsService.getRatingLeaderboardPosition(targetUserId);

        res.json({
          success: true,
          data: position,
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting leaderboard position:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get leaderboard position'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get rating impact on bookings
   * GET /api/analytics/impact/:userId
   */
  router.get('/impact/:userId',
    authMiddleware,
    async (req, res) => {
      try {
        const targetUserId = req.params.userId;
        const requestingUserId = req.user!.id;

        // Users can view their own impact analysis, admins can view anyone's
        if (targetUserId !== requestingUserId && req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You can only view your own rating impact analysis'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const impact = await ratingAnalyticsService.calculateRatingImpact(targetUserId);

        res.json({
          success: true,
          data: impact,
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error calculating rating impact:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to calculate rating impact'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  /**
   * Get platform-wide rating analytics (admin only)
   * GET /api/analytics/platform-stats
   */
  router.get('/platform-stats',
    authMiddleware,
    async (req, res) => {
      try {
        if (req.user?.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only administrators can view platform-wide analytics'
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const query = `
          SELECT 
            AVG(rating) as platform_average,
            COUNT(*) as total_reviews,
            COUNT(DISTINCT reviewee_id) as total_mentors,
            COUNT(DISTINCT reviewer_id) as total_reviewers,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rating) as median_rating,
            PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY rating) as p90_rating,
            rating,
            COUNT(*) as rating_count
          FROM reviews
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY rating
          ORDER BY rating
        `;

        const result = await db.query(query);
        
        if (result.rows.length === 0) {
          return res.json({
            success: true,
            data: {
              platformAverage: 0,
              totalReviews: 0,
              totalMentors: 0,
              totalReviewers: 0,
              medianRating: 0,
              p90Rating: 0,
              ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
            },
            timestamp: new Date().toISOString()
          } as ApiResponse);
        }

        const firstRow = result.rows[0];
        const platformAverage = parseFloat(firstRow.platform_average) || 0;
        const totalReviews = parseInt(firstRow.total_reviews) || 0;
        const totalMentors = parseInt(firstRow.total_mentors) || 0;
        const totalReviewers = parseInt(firstRow.total_reviewers) || 0;
        const medianRating = parseFloat(firstRow.median_rating) || 0;
        const p90Rating = parseFloat(firstRow.p90_rating) || 0;

        const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        for (const row of result.rows) {
          const rating = parseInt(row.rating);
          const count = parseInt(row.rating_count);
          if (rating >= 1 && rating <= 5) {
            ratingDistribution[rating] = count;
          }
        }

        res.json({
          success: true,
          data: {
            platformAverage: Math.round(platformAverage * 100) / 100,
            totalReviews,
            totalMentors,
            totalReviewers,
            medianRating: Math.round(medianRating * 100) / 100,
            p90Rating: Math.round(p90Rating * 100) / 100,
            ratingDistribution
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      } catch (error) {
        console.error('Error getting platform statistics:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get platform statistics'
          },
          timestamp: new Date().toISOString()
        } as ApiResponse);
      }
    }
  );

  return router;
}