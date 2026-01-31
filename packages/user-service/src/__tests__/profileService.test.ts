import { ProfileService } from '../services/profileService';
import { database } from '@mentor-platform/shared';

// Mock the database
jest.mock('@mentor-platform/shared', () => ({
  database: {
    getPool: jest.fn()
  }
}));

describe('ProfileService', () => {
  let profileService: ProfileService;
  let mockClient: any;
  let mockPool: any;

  beforeEach(() => {
    mockClient = {
      connect: jest.fn(),
      query: jest.fn(),
      release: jest.fn()
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient)
    };

    (database.getPool as jest.Mock).mockReturnValue(mockPool);
    profileService = new ProfileService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createProfile', () => {
    it('should create a mentor profile successfully', async () => {
      const userId = 'user-123';
      const mentorProfileData = {
        firstName: 'John',
        lastName: 'Doe',
        bio: 'Experienced software engineer',
        expertiseAreas: ['JavaScript', 'React'],
        yearsOfExperience: 5,
        hourlyRate: 100,
        availability: [],
        socialLinks: []
      };

      // Mock user query
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: userId, email: 'john@example.com', role: 'MENTOR', created_at: new Date() }]
        })
        // Mock mentor profile creation
        .mockResolvedValueOnce({
          rows: [{
            user_id: userId,
            first_name: 'John',
            last_name: 'Doe',
            bio: 'Experienced software engineer',
            expertise_areas: '["JavaScript","React"]',
            years_of_experience: 5,
            hourly_rate: 100,
            profile_image_url: null,
            social_links: '[]',
            rating: 0,
            total_sessions: 0
          }]
        });

      const result = await profileService.createProfile(userId, mentorProfileData);

      expect(result).toMatchObject({
        id: userId,
        email: 'john@example.com',
        role: 'MENTOR',
        profile: {
          userId,
          firstName: 'John',
          lastName: 'Doe',
          bio: 'Experienced software engineer',
          expertiseAreas: ['JavaScript', 'React'],
          yearsOfExperience: 5,
          hourlyRate: 100,
          rating: 0,
          totalSessions: 0
        }
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should create a student profile successfully', async () => {
      const userId = 'user-456';
      const studentProfileData = {
        firstName: 'Jane',
        lastName: 'Smith',
        bio: 'Aspiring developer',
        learningGoals: ['Learn React', 'Master JavaScript'],
        interests: ['Web Development', 'Mobile Apps'],
        currentLevel: 'BEGINNER' as const,
        preferredSessionTypes: ['ONE_ON_ONE']
      };

      // Mock user query
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: userId, email: 'jane@example.com', role: 'STUDENT', created_at: new Date() }]
        })
        // Mock student profile creation
        .mockResolvedValueOnce({
          rows: [{
            user_id: userId,
            first_name: 'Jane',
            last_name: 'Smith',
            bio: 'Aspiring developer',
            learning_goals: '["Learn React","Master JavaScript"]',
            interests: '["Web Development","Mobile Apps"]',
            current_level: 'BEGINNER',
            profile_image_url: null,
            preferred_session_types: '["ONE_ON_ONE"]'
          }]
        });

      const result = await profileService.createProfile(userId, studentProfileData);

      expect(result).toMatchObject({
        id: userId,
        email: 'jane@example.com',
        role: 'STUDENT',
        profile: {
          userId,
          firstName: 'Jane',
          lastName: 'Smith',
          bio: 'Aspiring developer',
          learningGoals: ['Learn React', 'Master JavaScript'],
          interests: ['Web Development', 'Mobile Apps'],
          currentLevel: 'BEGINNER'
        }
      });
    });

    it('should throw error if user not found', async () => {
      const userId = 'nonexistent-user';
      const profileData = {
        firstName: 'Test',
        lastName: 'User',
        bio: 'Test bio',
        expertiseAreas: ['Test'],
        yearsOfExperience: 1
      };

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await expect(profileService.createProfile(userId, profileData))
        .rejects.toThrow('User not found');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getProfile', () => {
    it('should retrieve mentor profile successfully', async () => {
      const userId = 'user-123';

      // Mock user query
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: userId, email: 'john@example.com', role: 'MENTOR', created_at: new Date() }]
        })
        // Mock mentor profile query
        .mockResolvedValueOnce({
          rows: [{
            user_id: userId,
            first_name: 'John',
            last_name: 'Doe',
            bio: 'Experienced software engineer',
            expertise_areas: '["JavaScript","React"]',
            years_of_experience: 5,
            hourly_rate: 100,
            profile_image_url: null,
            social_links: '[]',
            rating: 4.5,
            total_sessions: 10
          }]
        })
        // Mock availability query
        .mockResolvedValueOnce({
          rows: []
        });

      const result = await profileService.getProfile(userId);

      expect(result).toMatchObject({
        id: userId,
        email: 'john@example.com',
        role: 'MENTOR',
        profile: {
          userId,
          firstName: 'John',
          lastName: 'Doe',
          bio: 'Experienced software engineer',
          expertiseAreas: ['JavaScript', 'React'],
          yearsOfExperience: 5,
          hourlyRate: 100,
          rating: 4.5,
          totalSessions: 10
        }
      });
    });

    it('should return null if user not found', async () => {
      const userId = 'nonexistent-user';

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await profileService.getProfile(userId);

      expect(result).toBeNull();
    });
  });

  describe('searchUsers', () => {
    it('should search users with criteria', async () => {
      const criteria = {
        role: 'MENTOR',
        expertiseAreas: ['JavaScript'],
        searchTerm: 'experienced',
        limit: 10,
        offset: 0
      };

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'user-123',
          email: 'john@example.com',
          role: 'MENTOR',
          created_at: new Date(),
          first_name: 'John',
          last_name: 'Doe',
          bio: 'Experienced developer',
          expertise_areas: '["JavaScript","React"]',
          rating: 4.5,
          total_sessions: 10,
          learning_goals: null,
          interests: null,
          current_level: null
        }]
      });

      const result = await profileService.searchUsers(criteria);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'user-123',
        role: 'MENTOR',
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          bio: 'Experienced developer',
          expertiseAreas: ['JavaScript', 'React']
        }
      });
    });
  });
});