import { Pool } from 'pg';
import Redis from 'ioredis';
import { ReviewValidationService } from '../services/reviewValidationService';

// Mock dependencies
jest.mock('pg');
jest.mock('ioredis');

describe('ReviewValidationService', () => {
  let reviewValidationService: ReviewValidationService;
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    } as any;

    mockRedis = {
      setex: jest.fn(),
      get: jest.fn(),
    } as any;

    reviewValidationService = new ReviewValidationService(mockDb, mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateReview', () => {
    it('should validate a clean review successfully', async () => {
      mockDb.query.mockResolvedValue({ rows: [] } as any); // No recent reviews

      const result = await reviewValidationService.validateReview(
        'This was an excellent session! The mentor was very helpful and knowledgeable.',
        5,
        'session-123',
        'reviewer-456'
      );

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.confidence).toBe(1.0);
      expect(result.requiresModeration).toBe(false);
    });

    it('should detect profanity in review content', async () => {
      mockDb.query.mockResolvedValue({ rows: [] } as any);

      const result = await reviewValidationService.validateReview(
        'This session was damn good but could be better.',
        4,
        'session-123',
        'reviewer-456'
      );

      expect(result.isValid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('PROFANITY');
      expect(result.violations[0].severity).toBe('MEDIUM');
      expect(result.confidence).toBeLessThan(1.0);
    });

    it('should detect spam patterns', async () => {
      mockDb.query.mockResolvedValue({ rows: [] } as any);

      const result = await reviewValidationService.validateReview(
        'Great session! Contact me at john@example.com for more info.',
        5,
        'session-123',
        'reviewer-456'
      );

      expect(result.violations.some(v => v.type === 'SPAM')).toBe(true);
      expect(result.violations.some(v => v.type === 'PERSONAL_INFO')).toBe(true);
      expect(result.requiresModeration).toBe(true);
    });

    it('should detect rating inconsistency', async () => {
      mockDb.query.mockResolvedValue({ rows: [] } as any);

      const result = await reviewValidationService.validateReview(
        'This was terrible and awful, completely useless session.',
        5, // High rating with negative content
        'session-123',
        'reviewer-456'
      );

      expect(result.violations.some(v => 
        v.type === 'INAPPROPRIATE' && v.description.includes('High rating but negative')
      )).toBe(true);
    });

    it('should detect potential fake reviews based on frequency', async () => {
      // Mock high recent review count
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ recent_count: '10' }] } as any) // Recent reviews
        .mockResolvedValueOnce({ rows: [] } as any); // No duplicates

      const result = await reviewValidationService.validateReview(
        'Great session!',
        5,
        'session-123',
        'reviewer-456'
      );

      expect(result.violations.some(v => v.type === 'FAKE')).toBe(true);
      expect(result.requiresModeration).toBe(true);
    });

    it('should detect duplicate content', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ recent_count: '1' }] } as any) // Normal frequency
        .mockResolvedValueOnce({ rows: [{ duplicate_count: '1' }] } as any); // Duplicate found

      const result = await reviewValidationService.validateReview(
        'This is a duplicate review.',
        4,
        'session-123',
        'reviewer-456'
      );

      expect(result.violations.some(v => 
        v.type === 'FAKE' && v.severity === 'CRITICAL'
      )).toBe(true);
    });

    it('should flag very short reviews', async () => {
      mockDb.query.mockResolvedValue({ rows: [] } as any);

      const result = await reviewValidationService.validateReview(
        'Good.',
        5,
        'session-123',
        'reviewer-456'
      );

      expect(result.violations.some(v => 
        v.type === 'INAPPROPRIATE' && v.description.includes('too short')
      )).toBe(true);
    });

    it('should detect excessive caps usage', async () => {
      mockDb.query.mockResolvedValue({ rows: [] } as any);

      const result = await reviewValidationService.validateReview(
        'THIS WAS AN ABSOLUTELY AMAZING SESSION WITH GREAT CONTENT!!!',
        5,
        'session-123',
        'reviewer-456'
      );

      expect(result.violations.some(v => 
        v.type === 'INAPPROPRIATE' && v.description.includes('capital letters')
      )).toBe(true);
    });
  });

  describe('validateReviewAssociation', () => {
    it('should validate legitimate review association', async () => {
      const mockSessionData = {
        session_id: 'session-123',
        mentor_id: 'mentor-456',
        title: 'JavaScript Fundamentals',
        scheduled_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        student_id: 'student-789',
        registration_status: 'CONFIRMED',
        is_participant: true
      };

      mockDb.query.mockResolvedValue({ rows: [mockSessionData] } as any);

      const result = await reviewValidationService.validateReviewAssociation(
        'student-789',
        'session-123'
      );

      expect(result.isValidAssociation).toBe(true);
      expect(result.associationConfidence).toBeGreaterThan(0.8);
      expect(result.mentorId).toBe('mentor-456');
      expect(result.sessionTitle).toBe('JavaScript Fundamentals');
    });

    it('should reject association for non-participants', async () => {
      mockDb.query.mockResolvedValue({ rows: [] } as any); // No association found

      const result = await reviewValidationService.validateReviewAssociation(
        'random-user-123',
        'session-123'
      );

      expect(result.isValidAssociation).toBe(false);
      expect(result.associationConfidence).toBe(0);
    });

    it('should reject association for future sessions', async () => {
      const mockSessionData = {
        session_id: 'session-123',
        mentor_id: 'mentor-456',
        title: 'JavaScript Fundamentals',
        scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours in future
        student_id: 'student-789',
        registration_status: 'CONFIRMED',
        is_participant: true
      };

      mockDb.query.mockResolvedValue({ rows: [mockSessionData] } as any);

      const result = await reviewValidationService.validateReviewAssociation(
        'student-789',
        'session-123'
      );

      expect(result.isValidAssociation).toBe(false);
      expect(result.associationConfidence).toBeLessThan(1.0);
    });
  });

  describe('submitForModeration', () => {
    it('should submit review for moderation', async () => {
      const violations = [
        {
          type: 'PROFANITY' as const,
          severity: 'MEDIUM' as const,
          description: 'Contains inappropriate language',
          location: 'comment'
        }
      ];

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const moderationId = await reviewValidationService.submitForModeration(
        'review-123',
        violations,
        'HIGH'
      );

      expect(moderationId).toBeDefined();
      expect(moderationId).toMatch(/^mod_/);
      
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO review_moderation_queue'),
        expect.arrayContaining([
          moderationId,
          'review-123',
          JSON.stringify(violations),
          'HIGH'
        ])
      );

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `moderation:${moderationId}`,
        24 * 60 * 60,
        expect.stringContaining('review-123')
      );
    });
  });

  describe('processModerationAction', () => {
    it('should process APPROVE action', async () => {
      const mockReview = { comment: 'Original comment' };
      
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockReview] } as any) // Get original content
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any) // Insert action
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any); // Update queue

      const action = await reviewValidationService.processModerationAction(
        'review-123',
        'moderator-456',
        'APPROVE',
        'Review is appropriate'
      );

      expect(action.action).toBe('APPROVE');
      expect(action.reason).toBe('Review is appropriate');
      expect(action.originalContent).toBe('Original comment');
    });

    it('should process REJECT action', async () => {
      const mockReview = { comment: 'Inappropriate comment' };
      
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockReview] } as any) // Get original content
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any) // Insert action
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any) // Update review content
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any); // Update queue

      const action = await reviewValidationService.processModerationAction(
        'review-123',
        'moderator-456',
        'REJECT',
        'Contains inappropriate content'
      );

      expect(action.action).toBe('REJECT');
      
      // Verify review content was updated
      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE reviews SET comment = $2, updated_at = NOW() WHERE id = $1',
        ['review-123', '[Review removed by moderator]']
      );
    });

    it('should process EDIT action', async () => {
      const mockReview = { comment: 'Original comment with issues' };
      const editedContent = 'Edited comment without issues';
      
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockReview] } as any) // Get original content
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any) // Insert action
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any) // Update review content
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any); // Update queue

      const action = await reviewValidationService.processModerationAction(
        'review-123',
        'moderator-456',
        'EDIT',
        'Removed inappropriate language',
        editedContent
      );

      expect(action.action).toBe('EDIT');
      expect(action.editedContent).toBe(editedContent);
      
      // Verify review content was updated with edited content
      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE reviews SET comment = $2, updated_at = NOW() WHERE id = $1',
        ['review-123', editedContent]
      );
    });
  });

  describe('getPendingModerationReviews', () => {
    it('should return pending moderation reviews', async () => {
      const mockPendingReviews = [
        {
          id: 'mod-1',
          review_id: 'review-123',
          violations: JSON.stringify([{ type: 'PROFANITY', severity: 'MEDIUM' }]),
          priority: 'HIGH',
          created_at: new Date(),
          review_content: 'This is a problematic review',
          review_rating: 3,
          session_title: 'JavaScript Fundamentals'
        }
      ];

      mockDb.query.mockResolvedValue({ rows: mockPendingReviews } as any);

      const reviews = await reviewValidationService.getPendingModerationReviews(50, 'HIGH');

      expect(reviews).toHaveLength(1);
      expect(reviews[0].reviewId).toBe('review-123');
      expect(reviews[0].priority).toBe('HIGH');
      expect(reviews[0].violations).toHaveLength(1);
      expect(reviews[0].violations[0].type).toBe('PROFANITY');
    });
  });

  describe('getModerationStats', () => {
    it('should return moderation statistics', async () => {
      const mockStats = {
        pending: '5',
        processed: '15',
        approved: '10',
        rejected: '3',
        edited: '2',
        avg_processing_hours: '2.5'
      };

      mockDb.query.mockResolvedValue({ rows: [mockStats] } as any);

      const stats = await reviewValidationService.getModerationStats();

      expect(stats.pending).toBe(5);
      expect(stats.processed).toBe(15);
      expect(stats.approved).toBe(10);
      expect(stats.rejected).toBe(3);
      expect(stats.edited).toBe(2);
      expect(stats.averageProcessingTime).toBe(2.5);
    });
  });
});