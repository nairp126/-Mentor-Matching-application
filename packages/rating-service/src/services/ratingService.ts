import { Pool } from 'pg';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

export interface Review {
  id: string;
  sessionId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment?: string;
  tags?: string[];
  isAnonymous: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RatingPrompt {
  id: string;
  sessionId: string;
  userId: string;
  promptType: 'MENTOR_RATING' | 'STUDENT_RATING' | 'SESSION_RATING';
  status: 'PENDING' | 'COMPLETED' | 'DISMISSED' | 'EXPIRED';
  scheduledAt: Date;
  expiresAt: Date;
  remindersSent: number;
  maxReminders: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRatingData {
  sessionId: string;
  mentorId: string;
  studentIds: string[];
  sessionTitle: string;
  sessionDate: Date;
  duration: number;
}

export interface RatingStats {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: Record<number, number>;
  recentReviews: Review[];
}

export class RatingService {
  private db: Pool;
  private redis: Redis;

  constructor(db: Pool, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  /**
   * Create rating prompts after a session is completed
   */
  async createPostSessionRatingPrompts(sessionData: SessionRatingData): Promise<string[]> {
    const promptIds: string[] = [];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days to respond

    // Create prompts for students to rate the mentor
    for (const studentId of sessionData.studentIds) {
      const mentorRatingPromptId = await this.createRatingPrompt({
        sessionId: sessionData.sessionId,
        userId: studentId,
        promptType: 'MENTOR_RATING',
        scheduledAt: new Date(now.getTime() + 30 * 60 * 1000), // 30 minutes after session
        expiresAt,
        maxReminders: 3
      });
      promptIds.push(mentorRatingPromptId);

      // Also create session rating prompt
      const sessionRatingPromptId = await this.createRatingPrompt({
        sessionId: sessionData.sessionId,
        userId: studentId,
        promptType: 'SESSION_RATING',
        scheduledAt: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour after session
        expiresAt,
        maxReminders: 2
      });
      promptIds.push(sessionRatingPromptId);
    }

    // Create prompt for mentor to rate students (if applicable)
    if (sessionData.studentIds.length === 1) {
      const studentRatingPromptId = await this.createRatingPrompt({
        sessionId: sessionData.sessionId,
        userId: sessionData.mentorId,
        promptType: 'STUDENT_RATING',
        scheduledAt: new Date(now.getTime() + 45 * 60 * 1000), // 45 minutes after session
        expiresAt,
        maxReminders: 2
      });
      promptIds.push(studentRatingPromptId);
    }

    return promptIds;
  }

  /**
   * Submit a rating and review
   */
  async submitRating(
    reviewerId: string,
    sessionId: string,
    rating: number,
    comment?: string,
    tags?: string[],
    isAnonymous: boolean = false
  ): Promise<Review> {
    // Get session details to determine reviewee
    const sessionQuery = `
      SELECT mentor_id, title FROM sessions WHERE id = $1
    `;
    const sessionResult = await this.db.query(sessionQuery, [sessionId]);
    
    if (sessionResult.rows.length === 0) {
      throw new Error('Session not found');
    }

    const session = sessionResult.rows[0];
    let revieweeId: string;

    // Determine reviewee based on reviewer
    if (reviewerId === session.mentor_id) {
      // Mentor is reviewing a student - get the student ID
      const studentQuery = `
        SELECT student_id FROM session_registrations 
        WHERE session_id = $1 AND status = 'CONFIRMED'
        LIMIT 1
      `;
      const studentResult = await this.db.query(studentQuery, [sessionId]);
      
      if (studentResult.rows.length === 0) {
        throw new Error('No confirmed student found for this session');
      }
      
      revieweeId = studentResult.rows[0].student_id;
    } else {
      // Student is reviewing the mentor
      revieweeId = session.mentor_id;
    }

    // Check if review already exists
    const existingReviewQuery = `
      SELECT id FROM reviews 
      WHERE session_id = $1 AND reviewer_id = $2 AND reviewee_id = $3
    `;
    const existingResult = await this.db.query(existingReviewQuery, [sessionId, reviewerId, revieweeId]);
    
    if (existingResult.rows.length > 0) {
      throw new Error('Review already exists for this session');
    }

    // Validate rating
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    // Create review
    const reviewId = uuidv4();
    const review: Review = {
      id: reviewId,
      sessionId,
      reviewerId,
      revieweeId,
      rating,
      comment,
      tags,
      isAnonymous,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const insertQuery = `
      INSERT INTO reviews (
        id, session_id, reviewer_id, reviewee_id, rating, comment, 
        tags, is_anonymous, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    await this.db.query(insertQuery, [
      reviewId,
      sessionId,
      reviewerId,
      revieweeId,
      rating,
      comment,
      JSON.stringify(tags || []),
      isAnonymous,
      review.createdAt,
      review.updatedAt
    ]);

    // Mark rating prompt as completed
    await this.markRatingPromptCompleted(sessionId, reviewerId);

    // Update cached rating statistics
    await this.updateCachedRatingStats(revieweeId);

    // Update mentor's overall rating if this is a mentor review
    if (revieweeId === session.mentor_id) {
      await this.updateMentorRating(revieweeId);
    }

    return review;
  }

  /**
   * Get pending rating prompts for a user
   */
  async getPendingRatingPrompts(userId: string): Promise<RatingPrompt[]> {
    const query = `
      SELECT rp.*, s.title as session_title, s.scheduled_at as session_date
      FROM rating_prompts rp
      JOIN sessions s ON rp.session_id = s.id
      WHERE rp.user_id = $1 
        AND rp.status = 'PENDING'
        AND rp.expires_at > NOW()
      ORDER BY rp.scheduled_at ASC
    `;

    const result = await this.db.query(query, [userId]);
    return result.rows.map(this.mapRowToRatingPrompt);
  }

  /**
   * Process scheduled rating prompts
   */
  async processScheduledRatingPrompts(): Promise<void> {
    const query = `
      SELECT rp.*, s.title as session_title, s.scheduled_at as session_date,
             mp.first_name as mentor_first_name, mp.last_name as mentor_last_name
      FROM rating_prompts rp
      JOIN sessions s ON rp.session_id = s.id
      LEFT JOIN mentor_profiles mp ON s.mentor_id = mp.user_id
      WHERE rp.status = 'PENDING'
        AND rp.scheduled_at <= NOW()
        AND rp.expires_at > NOW()
      ORDER BY rp.scheduled_at ASC
      LIMIT 100
    `;

    const result = await this.db.query(query);
    const prompts = result.rows;

    for (const prompt of prompts) {
      try {
        await this.sendRatingPromptNotification(prompt);
        
        // Update prompt to track that notification was sent
        await this.updateRatingPromptSent(prompt.id);
      } catch (error) {
        console.error(`Error sending rating prompt ${prompt.id}:`, error);
      }
    }
  }

  /**
   * Dismiss a rating prompt
   */
  async dismissRatingPrompt(promptId: string, userId: string): Promise<void> {
    const query = `
      UPDATE rating_prompts
      SET status = 'DISMISSED', updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'PENDING'
    `;

    const result = await this.db.query(query, [promptId, userId]);
    
    if (result.rowCount === 0) {
      throw new Error('Rating prompt not found or already processed');
    }
  }

  /**
   * Get rating statistics for a user (mentor)
   */
  async getRatingStats(userId: string): Promise<RatingStats> {
    // Try to get from cache first
    const cacheKey = `rating_stats:${userId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Calculate from database
    const stats = await this.calculateRatingStats(userId);
    
    // Cache for 1 hour
    await this.redis.setex(cacheKey, 3600, JSON.stringify(stats));
    
    return stats;
  }

  /**
   * Get reviews for a user
   */
  async getReviews(
    userId: string,
    limit: number = 20,
    offset: number = 0,
    includeAnonymous: boolean = true
  ): Promise<{
    reviews: Review[];
    total: number;
  }> {
    const countQuery = `
      SELECT COUNT(*) as total
      FROM reviews r
      WHERE r.reviewee_id = $1
        AND ($2 OR r.is_anonymous = false)
    `;

    const reviewsQuery = `
      SELECT r.*, s.title as session_title, s.scheduled_at as session_date,
             CASE 
               WHEN r.is_anonymous THEN NULL
               ELSE COALESCE(mp.first_name || ' ' || mp.last_name, sp.first_name || ' ' || sp.last_name)
             END as reviewer_name
      FROM reviews r
      JOIN sessions s ON r.session_id = s.id
      LEFT JOIN mentor_profiles mp ON r.reviewer_id = mp.user_id
      LEFT JOIN student_profiles sp ON r.reviewer_id = sp.user_id
      WHERE r.reviewee_id = $1
        AND ($4 OR r.is_anonymous = false)
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const [countResult, reviewsResult] = await Promise.all([
      this.db.query(countQuery, [userId, includeAnonymous]),
      this.db.query(reviewsQuery, [userId, limit, offset, includeAnonymous])
    ]);

    const total = parseInt(countResult.rows[0].total);
    const reviews = reviewsResult.rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      reviewerId: row.reviewer_id,
      revieweeId: row.reviewee_id,
      rating: row.rating,
      comment: row.comment,
      tags: row.tags ? JSON.parse(row.tags) : [],
      isAnonymous: row.is_anonymous,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sessionTitle: row.session_title,
      sessionDate: row.session_date,
      reviewerName: row.reviewer_name
    }));

    return { reviews, total };
  }

  /**
   * Expire old rating prompts
   */
  async expireOldRatingPrompts(): Promise<number> {
    const query = `
      UPDATE rating_prompts
      SET status = 'EXPIRED', updated_at = NOW()
      WHERE status = 'PENDING' AND expires_at <= NOW()
    `;

    const result = await this.db.query(query);
    return result.rowCount || 0;
  }

  /**
   * Get rating prompt statistics
   */
  async getRatingPromptStats(): Promise<{
    pending: number;
    completed: number;
    dismissed: number;
    expired: number;
    completionRate: number;
  }> {
    const query = `
      SELECT 
        status,
        COUNT(*) as count
      FROM rating_prompts
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY status
    `;

    const result = await this.db.query(query);
    
    const stats = {
      pending: 0,
      completed: 0,
      dismissed: 0,
      expired: 0,
      completionRate: 0
    };

    let total = 0;
    for (const row of result.rows) {
      const count = parseInt(row.count);
      total += count;
      
      switch (row.status) {
        case 'PENDING':
          stats.pending = count;
          break;
        case 'COMPLETED':
          stats.completed = count;
          break;
        case 'DISMISSED':
          stats.dismissed = count;
          break;
        case 'EXPIRED':
          stats.expired = count;
          break;
      }
    }

    if (total > 0) {
      stats.completionRate = (stats.completed / total) * 100;
    }

    return stats;
  }

  /**
   * Create a rating prompt
   */
  private async createRatingPrompt(data: {
    sessionId: string;
    userId: string;
    promptType: RatingPrompt['promptType'];
    scheduledAt: Date;
    expiresAt: Date;
    maxReminders: number;
  }): Promise<string> {
    const promptId = uuidv4();
    
    const query = `
      INSERT INTO rating_prompts (
        id, session_id, user_id, prompt_type, status, scheduled_at, 
        expires_at, reminders_sent, max_reminders, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, 0, $7, NOW(), NOW())
    `;

    await this.db.query(query, [
      promptId,
      data.sessionId,
      data.userId,
      data.promptType,
      data.scheduledAt,
      data.expiresAt,
      data.maxReminders
    ]);

    return promptId;
  }

  /**
   * Mark rating prompt as completed
   */
  private async markRatingPromptCompleted(sessionId: string, userId: string): Promise<void> {
    const query = `
      UPDATE rating_prompts
      SET status = 'COMPLETED', updated_at = NOW()
      WHERE session_id = $1 AND user_id = $2 AND status = 'PENDING'
    `;

    await this.db.query(query, [sessionId, userId]);
  }

  /**
   * Update rating prompt to track notification sent
   */
  private async updateRatingPromptSent(promptId: string): Promise<void> {
    const query = `
      UPDATE rating_prompts
      SET reminders_sent = reminders_sent + 1,
          scheduled_at = CASE 
            WHEN reminders_sent + 1 < max_reminders 
            THEN NOW() + INTERVAL '24 hours'
            ELSE scheduled_at
          END,
          updated_at = NOW()
      WHERE id = $1
    `;

    await this.db.query(query, [promptId]);
  }

  /**
   * Send rating prompt notification
   */
  private async sendRatingPromptNotification(prompt: any): Promise<void> {
    // This would integrate with the notification service
    // For now, we'll just log the action
    console.log(`Sending rating prompt notification for session ${prompt.session_id} to user ${prompt.user_id}`);
    
    // In a real implementation, this would call the notification service:
    // await notificationService.sendNotification(prompt.user_id, {
    //   type: 'REVIEW_REQUEST',
    //   title: 'Please rate your session',
    //   message: `How was your session "${prompt.session_title}"?`,
    //   channels: ['EMAIL', 'IN_APP'],
    //   priority: 'MEDIUM',
    //   metadata: {
    //     sessionId: prompt.session_id,
    //     promptId: prompt.id,
    //     promptType: prompt.prompt_type
    //   }
    // });
  }

  /**
   * Calculate rating statistics for a user
   */
  private async calculateRatingStats(userId: string): Promise<RatingStats> {
    const statsQuery = `
      SELECT 
        AVG(rating) as average_rating,
        COUNT(*) as total_reviews,
        rating,
        COUNT(*) as rating_count
      FROM reviews
      WHERE reviewee_id = $1
      GROUP BY rating
      ORDER BY rating
    `;

    const recentQuery = `
      SELECT r.*, s.title as session_title
      FROM reviews r
      JOIN sessions s ON r.session_id = s.id
      WHERE r.reviewee_id = $1
      ORDER BY r.created_at DESC
      LIMIT 5
    `;

    const [statsResult, recentResult] = await Promise.all([
      this.db.query(statsQuery, [userId]),
      this.db.query(recentQuery, [userId])
    ]);

    let averageRating = 0;
    let totalReviews = 0;
    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (statsResult.rows.length > 0) {
      // Calculate average from the first row (AVG is the same across all rows)
      averageRating = parseFloat(statsResult.rows[0].average_rating) || 0;
      
      // Build distribution and total
      for (const row of statsResult.rows) {
        const rating = parseInt(row.rating);
        const count = parseInt(row.rating_count);
        ratingDistribution[rating] = count;
        totalReviews += count;
      }
    }

    const recentReviews = recentResult.rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      reviewerId: row.reviewer_id,
      revieweeId: row.reviewee_id,
      rating: row.rating,
      comment: row.comment,
      tags: row.tags ? JSON.parse(row.tags) : [],
      isAnonymous: row.is_anonymous,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sessionTitle: row.session_title
    }));

    return {
      averageRating: Math.round(averageRating * 100) / 100, // Round to 2 decimal places
      totalReviews,
      ratingDistribution,
      recentReviews
    };
  }

  /**
   * Update cached rating statistics
   */
  private async updateCachedRatingStats(userId: string): Promise<void> {
    const cacheKey = `rating_stats:${userId}`;
    await this.redis.del(cacheKey); // Clear cache to force recalculation
  }

  /**
   * Update mentor's overall rating in their profile
   */
  private async updateMentorRating(mentorId: string): Promise<void> {
    const query = `
      UPDATE mentor_profiles
      SET rating = (
        SELECT COALESCE(AVG(rating), 0)
        FROM reviews
        WHERE reviewee_id = $1
      ),
      total_sessions = (
        SELECT COUNT(DISTINCT session_id)
        FROM reviews
        WHERE reviewee_id = $1
      ),
      updated_at = NOW()
      WHERE user_id = $1
    `;

    await this.db.query(query, [mentorId]);
  }

  /**
   * Map database row to RatingPrompt object
   */
  private mapRowToRatingPrompt(row: any): RatingPrompt {
    return {
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      promptType: row.prompt_type,
      status: row.status,
      scheduledAt: row.scheduled_at,
      expiresAt: row.expires_at,
      remindersSent: row.reminders_sent,
      maxReminders: row.max_reminders,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}