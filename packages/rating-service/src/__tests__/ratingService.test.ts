import { Pool } from 'pg';
import Redis from 'ioredis';
import { RatingService, SessionRatingData } from '../services/ratingService';

// Mock dependencies
jest.mock('pg');
jest.mock('ioredis');

describe('RatingService', () => {
  let ratingService: RatingService;
  let mockDb: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    } as any;

    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      ping: jest.fn(),
    } as any;

    ratingService = new RatingService(mockDb, mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPostSessionRatingPrompts', () => {
    it('should create rating prompts for all session participants', async () => {
      const sessionData: SessionRatingData = {
        sessionId: 'session-123',
        mentorId: 'mentor-456',
        studentIds: ['student-789', 'student-101'],
        sessionTitle: 'JavaScript Fundamentals',
        sessionDate: new Date(),
        duration: 60
      };

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const promptIds = await ratingService.createPostSessionRatingPrompts(sessionData);

      // Should create 5 prompts: 2 students × 2 prompts each (mentor rating + session rating) + 1 mentor prompt (student rating)
      expect(promptIds).toHaveLength(5);
      expect(mockDb.query).toHaveBeenCalledTimes(5);

      // Verify mentor rating prompts for students
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO rating_prompts'),
        expect.arrayContaining([
          expect.any(String), // prompt ID
          'session-123',
          'student-789',
          'MENTOR_RATING',
          expect.any(Date), // scheduled_at
          expect.any(Date), // expires_at
          3 // max_reminders
        ])
      );

      // Verify session rating prompts for students
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO rating_prompts'),
        expect.arrayContaining([
          expect.any(String),
          'session-123',
          'student-789',
          'SESSION_RATING',
          expect.any(Date),
          expect.any(Date),
          2
        ])
      );

      // Verify student rating prompt for mentor
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO rating_prompts'),
        expect.arrayContaining([
          expect.any(String),
          'session-123',
          'mentor-456',
          'STUDENT_RATING',
          expect.any(Date),
          expect.any(Date),
          2
        ])
      );
    });

    it('should not create student rating prompt for group sessions', async () => {
      const sessionData: SessionRatingData = {
        sessionId: 'session-123',
        mentorId: 'mentor-456',
        studentIds: ['student-789', 'student-101', 'student-102'], // 3 students (group session)
        sessionTitle: 'Group Workshop',
        sessionDate: new Date(),
        duration: 90
      };

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const promptIds = await ratingService.createPostSessionRatingPrompts(sessionData);

      // Should create 6 prompts: 3 students × 2 prompts each (mentor rating + session rating), no mentor prompt for group sessions
      expect(promptIds).toHaveLength(6);
      expect(mockDb.query).toHaveBeenCalledTimes(6);

      // Verify no student rating prompts were created
      expect(mockDb.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO rating_prompts'),
        expect.arrayContaining([
          expect.any(String),
          'session-123',
          'mentor-456',
          'STUDENT_RATING',
          expect.any(Date),
          expect.any(Date),
          expect.any(Number)
        ])
      );
    });
  });

  describe('submitRating', () => {
    it('should submit a rating for a mentor by a student', async () => {
      const sessionData = {
        id: 'session-123',
        mentor_id: 'mentor-456',
        title: 'JavaScript Fundamentals'
      };

      // Mock session query
      mockDb.query
        .mockResolvedValueOnce({ rows: [sessionData] } as any) // Session details
        .mockResolvedValueOnce({ rows: [] } as any) // No existing review
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any) // Insert review
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any) // Mark prompt completed
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any); // Update mentor rating

      const review = await ratingService.submitRating(
        'student-789',
        'session-123',
        5,
        'Excellent mentor!',
        ['helpful', 'knowledgeable'],
        false
      );

      expect(review.rating).toBe(5);
      expect(review.comment).toBe('Excellent mentor!');
      expect(review.tags).toEqual(['helpful', 'knowledgeable']);
      expect(review.isAnonymous).toBe(false);
      expect(review.reviewerId).toBe('student-789');
      expect(review.revieweeId).toBe('mentor-456');

      // Verify review was inserted
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reviews'),
        expect.arrayContaining([
          expect.any(String), // review ID
          'session-123',
          'student-789',
          'mentor-456',
          5,
          'Excellent mentor!',
          JSON.stringify(['helpful', 'knowledgeable']),
          false,
          expect.any(Date),
          expect.any(Date)
        ])
      );

      // Verify mentor rating was updated
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE mentor_profiles'),
        ['mentor-456']
      );
    });

    it('should submit a rating for a student by a mentor', async () => {
      const sessionData = {
        id: 'session-123',
        mentor_id: 'mentor-456',
        title: 'JavaScript Fundamentals'
      };

      const studentData = {
        student_id: 'student-789'
      };

      // Mock queries
      mockDb.query
        .mockResolvedValueOnce({ rows: [sessionData] } as any) // Session details
        .mockResolvedValueOnce({ rows: [studentData] } as any) // Student details
        .mockResolvedValueOnce({ rows: [] } as any) // No existing review
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any) // Insert review
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any); // Mark prompt completed

      const review = await ratingService.submitRating(
        'mentor-456',
        'session-123',
        4,
        'Good student, well prepared',
        ['engaged', 'prepared'],
        false
      );

      expect(review.reviewerId).toBe('mentor-456');
      expect(review.revieweeId).toBe('student-789');
      expect(review.rating).toBe(4);
    });

    it('should reject duplicate reviews', async () => {
      const sessionData = {
        id: 'session-123',
        mentor_id: 'mentor-456',
        title: 'JavaScript Fundamentals'
      };

      const existingReview = {
        id: 'existing-review-123'
      };

      // Mock queries
      mockDb.query
        .mockResolvedValueOnce({ rows: [sessionData] } as any) // Session details
        .mockResolvedValueOnce({ rows: [existingReview] } as any); // Existing review found

      await expect(
        ratingService.submitRating('student-789', 'session-123', 5, 'Great!')
      ).rejects.toThrow('Review already exists for this session');
    });

    it('should reject invalid ratings', async () => {
      const sessionData = {
        id: 'session-123',
        mentor_id: 'mentor-456',
        title: 'JavaScript Fundamentals'
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [sessionData] } as any) // Session details
        .mockResolvedValueOnce({ rows: [] } as any); // No existing review

      await expect(
        ratingService.submitRating('student-789', 'session-123', 6, 'Invalid rating')
      ).rejects.toThrow('Rating must be between 1 and 5');

      await expect(
        ratingService.submitRating('student-789', 'session-123', 0, 'Invalid rating')
      ).rejects.toThrow('Rating must be between 1 and 5');
    });
  });

  describe('getPendingRatingPrompts', () => {
    it('should return pending rating prompts for a user', async () => {
      const mockPrompts = [
        {
          id: 'prompt-1',
          session_id: 'session-123',
          user_id: 'student-789',
          prompt_type: 'MENTOR_RATING',
          status: 'PENDING',
          scheduled_at: new Date(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          reminders_sent: 0,
          max_reminders: 3,
          created_at: new Date(),
          updated_at: new Date(),
          session_title: 'JavaScript Fundamentals',
          session_date: new Date()
        }
      ];

      mockDb.query.mockResolvedValue({ rows: mockPrompts } as any);

      const prompts = await ratingService.getPendingRatingPrompts('student-789');

      expect(prompts).toHaveLength(1);
      expect(prompts[0].id).toBe('prompt-1');
      expect(prompts[0].promptType).toBe('MENTOR_RATING');
      expect(prompts[0].status).toBe('PENDING');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT rp.*, s.title as session_title'),
        ['student-789']
      );
    });
  });

  describe('dismissRatingPrompt', () => {
    it('should dismiss a rating prompt', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 1 } as any);

      await ratingService.dismissRatingPrompt('prompt-123', 'student-789');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE rating_prompts'),
        ['prompt-123', 'student-789']
      );
    });

    it('should throw error if prompt not found', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 0 } as any);

      await expect(
        ratingService.dismissRatingPrompt('prompt-123', 'student-789')
      ).rejects.toThrow('Rating prompt not found or already processed');
    });
  });

  describe('getRatingStats', () => {
    it('should return cached rating statistics', async () => {
      const cachedStats = {
        averageRating: 4.5,
        totalReviews: 10,
        ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 4, 5: 5 },
        recentReviews: []
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedStats));

      const stats = await ratingService.getRatingStats('mentor-456');

      expect(stats).toEqual(cachedStats);
      expect(mockRedis.get).toHaveBeenCalledWith('rating_stats:mentor-456');
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should calculate and cache rating statistics when not cached', async () => {
      const mockStatsData = [
        { average_rating: '4.5', rating: 4, rating_count: '4' },
        { average_rating: '4.5', rating: 5, rating_count: '6' }
      ];

      const mockRecentReviews = [
        {
          id: 'review-1',
          session_id: 'session-123',
          reviewer_id: 'student-789',
          reviewee_id: 'mentor-456',
          rating: 5,
          comment: 'Great!',
          tags: '["helpful"]',
          is_anonymous: false,
          created_at: new Date(),
          updated_at: new Date(),
          session_title: 'JavaScript Fundamentals'
        }
      ];

      mockRedis.get.mockResolvedValue(null); // No cache
      mockDb.query
        .mockResolvedValueOnce({ rows: mockStatsData } as any) // Stats query
        .mockResolvedValueOnce({ rows: mockRecentReviews } as any); // Recent reviews query

      const stats = await ratingService.getRatingStats('mentor-456');

      expect(stats.averageRating).toBe(4.5);
      expect(stats.totalReviews).toBe(10); // 4 + 6
      expect(stats.ratingDistribution[4]).toBe(4);
      expect(stats.ratingDistribution[5]).toBe(6);
      expect(stats.recentReviews).toHaveLength(1);

      // Verify caching
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'rating_stats:mentor-456',
        3600,
        JSON.stringify(stats)
      );
    });
  });

  describe('getReviews', () => {
    it('should return reviews for a user', async () => {
      const mockCountResult = [{ total: '5' }];
      const mockReviewsResult = [
        {
          id: 'review-1',
          session_id: 'session-123',
          reviewer_id: 'student-789',
          reviewee_id: 'mentor-456',
          rating: 5,
          comment: 'Excellent mentor!',
          tags: '["helpful", "knowledgeable"]',
          is_anonymous: false,
          created_at: new Date(),
          updated_at: new Date(),
          session_title: 'JavaScript Fundamentals',
          session_date: new Date(),
          reviewer_name: 'John Doe'
        }
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockCountResult } as any) // Count query
        .mockResolvedValueOnce({ rows: mockReviewsResult } as any); // Reviews query

      const result = await ratingService.getReviews('mentor-456', 20, 0, true);

      expect(result.total).toBe(5);
      expect(result.reviews).toHaveLength(1);
      expect(result.reviews[0].id).toBe('review-1');
      expect(result.reviews[0].rating).toBe(5);
      expect(result.reviews[0].tags).toEqual(['helpful', 'knowledgeable']);
    });
  });

  describe('expireOldRatingPrompts', () => {
    it('should expire old rating prompts', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 3 } as any);

      const expiredCount = await ratingService.expireOldRatingPrompts();

      expect(expiredCount).toBe(3);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE rating_prompts'),
        []
      );
    });
  });

  describe('getRatingPromptStats', () => {
    it('should return rating prompt statistics', async () => {
      const mockStatsData = [
        { status: 'PENDING', count: '5' },
        { status: 'COMPLETED', count: '15' },
        { status: 'DISMISSED', count: '3' },
        { status: 'EXPIRED', count: '2' }
      ];

      mockDb.query.mockResolvedValue({ rows: mockStatsData } as any);

      const stats = await ratingService.getRatingPromptStats();

      expect(stats.pending).toBe(5);
      expect(stats.completed).toBe(15);
      expect(stats.dismissed).toBe(3);
      expect(stats.expired).toBe(2);
      expect(stats.completionRate).toBe(60); // 15/25 * 100
    });
  });
});