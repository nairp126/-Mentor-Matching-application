import { Pool } from 'pg';
import Redis from 'ioredis';

export interface ReviewValidationResult {
  isValid: boolean;
  violations: ValidationViolation[];
  confidence: number;
  requiresModeration: boolean;
  suggestedActions: string[];
}

export interface ValidationViolation {
  type: 'PROFANITY' | 'SPAM' | 'INAPPROPRIATE' | 'OFF_TOPIC' | 'PERSONAL_INFO' | 'FAKE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  location?: string; // Where in the review the violation occurs
}

export interface ReviewModerationAction {
  id: string;
  reviewId: string;
  moderatorId: string;
  action: 'APPROVE' | 'REJECT' | 'EDIT' | 'FLAG' | 'REQUEST_CLARIFICATION';
  reason: string;
  originalContent?: string;
  editedContent?: string;
  createdAt: Date;
}

export interface ReviewAssociation {
  reviewId: string;
  sessionId: string;
  mentorId: string;
  studentId: string;
  sessionDate: Date;
  sessionTitle: string;
  isValidAssociation: boolean;
  associationConfidence: number;
}

export class ReviewValidationService {
  private db: Pool;
  private redis: Redis;

  // Profanity filter patterns (simplified - in production use a comprehensive library)
  private profanityPatterns = [
    /\b(damn|hell|crap)\b/gi, // Mild profanity
    // Add more patterns as needed
  ];

  // Spam detection patterns
  private spamPatterns = [
    /contact\s+me\s+at/gi,
    /visit\s+my\s+website/gi,
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // Phone numbers
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
    /\b(buy|sell|cheap|discount|offer|deal)\b.*\b(now|today|limited)\b/gi
  ];

  constructor(db: Pool, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  /**
   * Validate a review before submission
   */
  async validateReview(
    content: string,
    rating: number,
    sessionId: string,
    reviewerId: string
  ): Promise<ReviewValidationResult> {
    const violations: ValidationViolation[] = [];
    let confidence = 1.0;

    // Check for profanity
    const profanityViolations = this.checkProfanity(content);
    violations.push(...profanityViolations);

    // Check for spam
    const spamViolations = this.checkSpam(content);
    violations.push(...spamViolations);

    // Check for inappropriate content
    const inappropriateViolations = this.checkInappropriateContent(content);
    violations.push(...inappropriateViolations);

    // Check for personal information
    const personalInfoViolations = this.checkPersonalInformation(content);
    violations.push(...personalInfoViolations);

    // Check rating consistency
    const consistencyViolations = this.checkRatingConsistency(content, rating);
    violations.push(...consistencyViolations);

    // Check for potential fake reviews
    const fakeReviewViolations = await this.checkFakeReview(reviewerId, sessionId, content);
    violations.push(...fakeReviewViolations);

    // Calculate confidence based on violations
    const criticalViolations = violations.filter(v => v.severity === 'CRITICAL').length;
    const highViolations = violations.filter(v => v.severity === 'HIGH').length;
    const mediumViolations = violations.filter(v => v.severity === 'MEDIUM').length;

    confidence -= (criticalViolations * 0.5) + (highViolations * 0.3) + (mediumViolations * 0.1);
    confidence = Math.max(0, confidence);

    const isValid = violations.length === 0 || violations.every(v => v.severity === 'LOW');
    const requiresModeration = violations.some(v => ['HIGH', 'CRITICAL'].includes(v.severity));

    const suggestedActions = this.generateSuggestedActions(violations);

    return {
      isValid,
      violations,
      confidence,
      requiresModeration,
      suggestedActions
    };
  }

  /**
   * Validate review association with session
   */
  async validateReviewAssociation(
    reviewerId: string,
    sessionId: string
  ): Promise<ReviewAssociation> {
    const query = `
      SELECT 
        s.id as session_id,
        s.mentor_id,
        s.title as session_title,
        s.scheduled_at as session_date,
        sr.student_id,
        sr.status as registration_status,
        CASE 
          WHEN s.mentor_id = $1 THEN true
          WHEN sr.student_id = $1 AND sr.status = 'CONFIRMED' THEN true
          ELSE false
        END as is_participant
      FROM sessions s
      LEFT JOIN session_registrations sr ON s.id = sr.session_id
      WHERE s.id = $2
        AND (s.mentor_id = $1 OR sr.student_id = $1)
    `;

    const result = await this.db.query(query, [reviewerId, sessionId]);
    
    if (result.rows.length === 0) {
      return {
        reviewId: '',
        sessionId,
        mentorId: '',
        studentId: '',
        sessionDate: new Date(),
        sessionTitle: '',
        isValidAssociation: false,
        associationConfidence: 0
      };
    }

    const row = result.rows[0];
    const isParticipant = row.is_participant;
    const sessionDate = new Date(row.session_date);
    const now = new Date();
    
    // Check if session has occurred
    const sessionCompleted = sessionDate < now;
    
    // Calculate confidence based on various factors
    let confidence = 0;
    
    if (isParticipant) confidence += 0.7;
    if (sessionCompleted) confidence += 0.2;
    if (row.registration_status === 'CONFIRMED') confidence += 0.1;

    const isValidAssociation = isParticipant && sessionCompleted;

    return {
      reviewId: '',
      sessionId,
      mentorId: row.mentor_id,
      studentId: row.student_id || reviewerId,
      sessionDate,
      sessionTitle: row.session_title,
      isValidAssociation,
      associationConfidence: confidence
    };
  }

  /**
   * Submit review for moderation
   */
  async submitForModeration(
    reviewId: string,
    violations: ValidationViolation[],
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' = 'MEDIUM'
  ): Promise<string> {
    const moderationId = `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const query = `
      INSERT INTO review_moderation_queue (
        id, review_id, violations, priority, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'PENDING', NOW(), NOW())
    `;

    await this.db.query(query, [
      moderationId,
      reviewId,
      JSON.stringify(violations),
      priority
    ]);

    // Cache for quick access
    await this.redis.setex(
      `moderation:${moderationId}`,
      24 * 60 * 60, // 24 hours
      JSON.stringify({ reviewId, violations, priority })
    );

    return moderationId;
  }

  /**
   * Process moderation action
   */
  async processModerationAction(
    reviewId: string,
    moderatorId: string,
    action: ReviewModerationAction['action'],
    reason: string,
    editedContent?: string
  ): Promise<ReviewModerationAction> {
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Get original review content
    const reviewQuery = `SELECT comment FROM reviews WHERE id = $1`;
    const reviewResult = await this.db.query(reviewQuery, [reviewId]);
    const originalContent = reviewResult.rows[0]?.comment || '';

    const moderationAction: ReviewModerationAction = {
      id: actionId,
      reviewId,
      moderatorId,
      action,
      reason,
      originalContent,
      editedContent,
      createdAt: new Date()
    };

    // Store moderation action
    const actionQuery = `
      INSERT INTO review_moderation_actions (
        id, review_id, moderator_id, action, reason, 
        original_content, edited_content, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await this.db.query(actionQuery, [
      actionId,
      reviewId,
      moderatorId,
      action,
      reason,
      originalContent,
      editedContent,
      moderationAction.createdAt
    ]);

    // Apply the action
    await this.applyModerationAction(reviewId, action, editedContent);

    // Update moderation queue
    await this.updateModerationQueue(reviewId, action);

    return moderationAction;
  }

  /**
   * Get reviews pending moderation
   */
  async getPendingModerationReviews(
    limit: number = 50,
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  ): Promise<Array<{
    id: string;
    reviewId: string;
    violations: ValidationViolation[];
    priority: string;
    createdAt: Date;
    reviewContent: string;
    reviewRating: number;
    sessionTitle: string;
  }>> {
    let query = `
      SELECT 
        rmq.*,
        r.comment as review_content,
        r.rating as review_rating,
        s.title as session_title
      FROM review_moderation_queue rmq
      JOIN reviews r ON rmq.review_id = r.id
      JOIN sessions s ON r.session_id = s.id
      WHERE rmq.status = 'PENDING'
    `;

    const params: any[] = [];
    
    if (priority) {
      query += ` AND rmq.priority = $${params.length + 1}`;
      params.push(priority);
    }

    query += ` ORDER BY 
      CASE rmq.priority 
        WHEN 'URGENT' THEN 1 
        WHEN 'HIGH' THEN 2 
        WHEN 'MEDIUM' THEN 3 
        WHEN 'LOW' THEN 4 
      END,
      rmq.created_at ASC
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const result = await this.db.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      reviewId: row.review_id,
      violations: JSON.parse(row.violations),
      priority: row.priority,
      createdAt: row.created_at,
      reviewContent: row.review_content,
      reviewRating: row.review_rating,
      sessionTitle: row.session_title
    }));
  }

  /**
   * Get moderation statistics
   */
  async getModerationStats(): Promise<{
    pending: number;
    processed: number;
    approved: number;
    rejected: number;
    edited: number;
    averageProcessingTime: number;
  }> {
    const query = `
      SELECT 
        COUNT(CASE WHEN rmq.status = 'PENDING' THEN 1 END) as pending,
        COUNT(CASE WHEN rmq.status = 'PROCESSED' THEN 1 END) as processed,
        COUNT(CASE WHEN rma.action = 'APPROVE' THEN 1 END) as approved,
        COUNT(CASE WHEN rma.action = 'REJECT' THEN 1 END) as rejected,
        COUNT(CASE WHEN rma.action = 'EDIT' THEN 1 END) as edited,
        AVG(EXTRACT(EPOCH FROM (rmq.updated_at - rmq.created_at))/3600) as avg_processing_hours
      FROM review_moderation_queue rmq
      LEFT JOIN review_moderation_actions rma ON rmq.review_id = rma.review_id
      WHERE rmq.created_at >= NOW() - INTERVAL '30 days'
    `;

    const result = await this.db.query(query);
    const row = result.rows[0];

    return {
      pending: parseInt(row.pending) || 0,
      processed: parseInt(row.processed) || 0,
      approved: parseInt(row.approved) || 0,
      rejected: parseInt(row.rejected) || 0,
      edited: parseInt(row.edited) || 0,
      averageProcessingTime: parseFloat(row.avg_processing_hours) || 0
    };
  }

  /**
   * Check for profanity in content
   */
  private checkProfanity(content: string): ValidationViolation[] {
    const violations: ValidationViolation[] = [];
    
    for (const pattern of this.profanityPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        violations.push({
          type: 'PROFANITY',
          severity: 'MEDIUM',
          description: `Contains inappropriate language: ${matches.join(', ')}`,
          location: 'comment'
        });
      }
    }

    return violations;
  }

  /**
   * Check for spam patterns
   */
  private checkSpam(content: string): ValidationViolation[] {
    const violations: ValidationViolation[] = [];
    
    for (const pattern of this.spamPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        violations.push({
          type: 'SPAM',
          severity: 'HIGH',
          description: `Contains spam-like content: ${matches[0]}`,
          location: 'comment'
        });
      }
    }

    return violations;
  }

  /**
   * Check for inappropriate content
   */
  private checkInappropriateContent(content: string): ValidationViolation[] {
    const violations: ValidationViolation[] = [];
    
    // Check for excessive caps
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (capsRatio > 0.5 && content.length > 20) {
      violations.push({
        type: 'INAPPROPRIATE',
        severity: 'LOW',
        description: 'Excessive use of capital letters',
        location: 'comment'
      });
    }

    // Check for very short reviews with high ratings (potential fake)
    if (content.trim().length < 10) {
      violations.push({
        type: 'INAPPROPRIATE',
        severity: 'LOW',
        description: 'Review content is too short to be meaningful',
        location: 'comment'
      });
    }

    return violations;
  }

  /**
   * Check for personal information
   */
  private checkPersonalInformation(content: string): ValidationViolation[] {
    const violations: ValidationViolation[] = [];
    
    // Check for email addresses
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    if (emailPattern.test(content)) {
      violations.push({
        type: 'PERSONAL_INFO',
        severity: 'HIGH',
        description: 'Contains email address',
        location: 'comment'
      });
    }

    // Check for phone numbers
    const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
    if (phonePattern.test(content)) {
      violations.push({
        type: 'PERSONAL_INFO',
        severity: 'HIGH',
        description: 'Contains phone number',
        location: 'comment'
      });
    }

    return violations;
  }

  /**
   * Check rating consistency with comment
   */
  private checkRatingConsistency(content: string, rating: number): ValidationViolation[] {
    const violations: ValidationViolation[] = [];
    
    // Simple sentiment analysis
    const positiveWords = ['great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'good', 'helpful'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'useless', 'waste', 'poor'];
    
    const lowerContent = content.toLowerCase();
    const positiveCount = positiveWords.filter(word => lowerContent.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerContent.includes(word)).length;
    
    // Check for inconsistency
    if (rating >= 4 && negativeCount > positiveCount) {
      violations.push({
        type: 'INAPPROPRIATE',
        severity: 'MEDIUM',
        description: 'High rating but negative comment content',
        location: 'rating'
      });
    } else if (rating <= 2 && positiveCount > negativeCount) {
      violations.push({
        type: 'INAPPROPRIATE',
        severity: 'MEDIUM',
        description: 'Low rating but positive comment content',
        location: 'rating'
      });
    }

    return violations;
  }

  /**
   * Check for potential fake reviews
   */
  private async checkFakeReview(
    reviewerId: string,
    sessionId: string,
    content: string
  ): Promise<ValidationViolation[]> {
    const violations: ValidationViolation[] = [];
    
    // Check review frequency
    const recentReviewsQuery = `
      SELECT COUNT(*) as recent_count
      FROM reviews
      WHERE reviewer_id = $1
        AND created_at >= NOW() - INTERVAL '24 hours'
    `;

    const recentResult = await this.db.query(recentReviewsQuery, [reviewerId]);
    const recentCount = parseInt(recentResult.rows[0].recent_count);

    if (recentCount > 5) {
      violations.push({
        type: 'FAKE',
        severity: 'HIGH',
        description: 'Unusually high review frequency',
        location: 'reviewer'
      });
    }

    // Check for duplicate content
    const duplicateQuery = `
      SELECT COUNT(*) as duplicate_count
      FROM reviews
      WHERE reviewer_id = $1
        AND comment = $2
        AND id != $3
    `;

    const duplicateResult = await this.db.query(duplicateQuery, [reviewerId, content, sessionId]);
    const duplicateCount = parseInt(duplicateResult.rows[0].duplicate_count);

    if (duplicateCount > 0) {
      violations.push({
        type: 'FAKE',
        severity: 'CRITICAL',
        description: 'Duplicate review content detected',
        location: 'comment'
      });
    }

    return violations;
  }

  /**
   * Generate suggested actions based on violations
   */
  private generateSuggestedActions(violations: ValidationViolation[]): string[] {
    const actions: string[] = [];
    
    if (violations.some(v => v.type === 'PROFANITY')) {
      actions.push('Remove or replace inappropriate language');
    }
    
    if (violations.some(v => v.type === 'SPAM')) {
      actions.push('Remove promotional content and contact information');
    }
    
    if (violations.some(v => v.type === 'PERSONAL_INFO')) {
      actions.push('Remove personal contact information');
    }
    
    if (violations.some(v => v.type === 'FAKE')) {
      actions.push('Verify review authenticity');
    }
    
    if (violations.some(v => v.severity === 'CRITICAL')) {
      actions.push('Reject review and notify user');
    }

    return actions;
  }

  /**
   * Apply moderation action to review
   */
  private async applyModerationAction(
    reviewId: string,
    action: ReviewModerationAction['action'],
    editedContent?: string
  ): Promise<void> {
    switch (action) {
      case 'APPROVE':
        // No action needed, review remains as is
        break;
        
      case 'REJECT':
        await this.db.query(
          'UPDATE reviews SET comment = $2, updated_at = NOW() WHERE id = $1',
          [reviewId, '[Review removed by moderator]']
        );
        break;
        
      case 'EDIT':
        if (editedContent) {
          await this.db.query(
            'UPDATE reviews SET comment = $2, updated_at = NOW() WHERE id = $1',
            [reviewId, editedContent]
          );
        }
        break;
        
      case 'FLAG':
        // Add flag to review metadata
        await this.db.query(
          `UPDATE reviews 
           SET metadata = COALESCE(metadata, '{}') || '{"flagged": true}'::jsonb,
               updated_at = NOW()
           WHERE id = $1`,
          [reviewId]
        );
        break;
    }
  }

  /**
   * Update moderation queue status
   */
  private async updateModerationQueue(
    reviewId: string,
    action: ReviewModerationAction['action']
  ): Promise<void> {
    await this.db.query(
      'UPDATE review_moderation_queue SET status = $2, updated_at = NOW() WHERE review_id = $1',
      [reviewId, 'PROCESSED']
    );
  }
}