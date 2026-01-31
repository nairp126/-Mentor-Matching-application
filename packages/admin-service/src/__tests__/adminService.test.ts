import { AdminService } from '../services/adminService';
import { DatabaseUtils } from '@mentor-platform/shared';

// Mock the database connection
jest.mock('@mentor-platform/shared', () => ({
  DatabaseUtils: {
    getConnection: jest.fn()
  }
}));

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    del: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    info: jest.fn(),
    ping: jest.fn()
  }));
});

describe('AdminService', () => {
  let adminService: AdminService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue({
        query: jest.fn(),
        release: jest.fn()
      })
    };
    
    (DatabaseUtils.getConnection as jest.Mock).mockReturnValue(mockDb);
    adminService = new AdminService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboardOverview', () => {
    it('should return dashboard overview with user and session statistics', async () => {
      // Mock database responses
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            total: '150',
            active: '120',
            mentors: '75',
            students: '75',
            new_this_month: '25'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            total: '500',
            scheduled: '50',
            completed: '400',
            cancelled: '50',
            completion_rate: '88.89'
          }]
        });

      const overview = await adminService.getDashboardOverview();

      expect(overview).toHaveProperty('users');
      expect(overview).toHaveProperty('sessions');
      expect(overview).toHaveProperty('system');
      expect(overview).toHaveProperty('revenue');

      expect(overview.users.total).toBe(150);
      expect(overview.users.mentors).toBe(75);
      expect(overview.users.students).toBe(75);
      expect(overview.sessions.total).toBe(500);
      expect(overview.sessions.completionRate).toBe(88.89);
    });

    it('should handle database errors gracefully', async () => {
      mockDb.query.mockRejectedValue(new Error('Database connection failed'));

      await expect(adminService.getDashboardOverview()).rejects.toThrow('Failed to get dashboard overview');
    });
  });

  describe('getAdminProfile', () => {
    it('should return admin profile for valid admin ID', async () => {
      const adminId = 'admin-123';
      const mockProfile = {
        id: adminId,
        email: 'admin@example.com',
        role: 'ADMIN',
        first_name: 'Admin',
        last_name: 'User',
        preferences: { theme: 'dark' }
      };

      mockDb.query.mockResolvedValue({
        rows: [mockProfile]
      });

      const profile = await adminService.getAdminProfile(adminId);

      expect(profile).toEqual(mockProfile);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [adminId]
      );
    });

    it('should throw error for non-existent admin', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await expect(adminService.getAdminProfile('non-existent')).rejects.toThrow('Admin profile not found');
    });
  });

  describe('updateAdminProfile', () => {
    it('should update admin profile successfully', async () => {
      const adminId = 'admin-123';
      const updates = {
        firstName: 'Updated',
        lastName: 'Admin',
        email: 'updated@example.com',
        preferences: { theme: 'light' }
      };

      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);
      mockClient.query.mockResolvedValue({ rows: [] });

      // Mock the getAdminProfile call at the end
      jest.spyOn(adminService, 'getAdminProfile').mockResolvedValue({
        id: adminId,
        ...updates
      });

      const result = await adminService.updateAdminProfile(adminId, updates);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toHaveProperty('id', adminId);
    });

    it('should rollback transaction on error', async () => {
      const adminId = 'admin-123';
      const updates = { firstName: 'Updated' };

      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Update failed')); // UPDATE fails

      await expect(adminService.updateAdminProfile(adminId, updates)).rejects.toThrow('Failed to update admin profile');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getSystemStatus', () => {
    it('should return comprehensive system status', async () => {
      const status = await adminService.getSystemStatus();

      expect(status).toHaveProperty('services');
      expect(status).toHaveProperty('database');
      expect(status).toHaveProperty('cache');
      expect(status).toHaveProperty('storage');

      expect(Array.isArray(status.services)).toBe(true);
      expect(status.database).toHaveProperty('status');
      expect(status.cache).toHaveProperty('status');
      expect(status.storage).toHaveProperty('used');
    });
  });

  describe('sendBulkNotifications', () => {
    it('should send notifications to all users when type is "all"', async () => {
      const recipients = { type: 'all' };
      const notification = {
        title: 'System Maintenance',
        message: 'Scheduled maintenance tonight',
        type: 'INFO',
        channels: ['EMAIL', 'IN_APP'],
        priority: 'MEDIUM'
      };

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'user1' }, { id: 'user2' }, { id: 'user3' }]
        })
        .mockResolvedValue({ rows: [] }); // For the INSERT queries

      const result = await adminService.sendBulkNotifications(recipients, notification);

      expect(result).toHaveProperty('notificationId');
      expect(result).toHaveProperty('recipientCount', 3);
      expect(result).toHaveProperty('status', 'queued');
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT id FROM users WHERE deleted_at IS NULL'
      );
    });

    it('should send notifications to specific roles', async () => {
      const recipients = { type: 'role', roles: ['MENTOR'] };
      const notification = {
        title: 'Mentor Update',
        message: 'New features for mentors',
        type: 'INFO',
        channels: ['IN_APP'],
        priority: 'MEDIUM'
      };

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'mentor1' }, { id: 'mentor2' }]
        })
        .mockResolvedValue({ rows: [] }); // For the INSERT queries

      const result = await adminService.sendBulkNotifications(recipients, notification);

      expect(result.recipientCount).toBe(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT id FROM users WHERE role = ANY($1) AND deleted_at IS NULL',
        [['MENTOR']]
      );
    });

    it('should send notifications to specific users', async () => {
      const recipients = { type: 'specific', userIds: ['user1', 'user2'] };
      const notification = {
        title: 'Personal Message',
        message: 'This is for you',
        type: 'INFO',
        channels: ['EMAIL'],
        priority: 'HIGH'
      };

      mockDb.query.mockResolvedValue({ rows: [] }); // For the INSERT queries

      const result = await adminService.sendBulkNotifications(recipients, notification);

      expect(result.recipientCount).toBe(2);
    });
  });

  describe('exportData', () => {
    it('should create export job successfully', async () => {
      const params = {
        type: 'users',
        format: 'csv',
        dateRange: {
          start: new Date('2023-01-01'),
          end: new Date('2023-12-31')
        },
        filters: { roles: ['MENTOR'] }
      };

      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await adminService.exportData(params);

      expect(result).toHaveProperty('exportId');
      expect(result).toHaveProperty('status', 'processing');
      expect(result).toHaveProperty('estimatedCompletion');
      expect(result).toHaveProperty('downloadUrl');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO export_jobs'),
        expect.arrayContaining([expect.stringMatching(/^export_/), 'users', 'csv'])
      );
    });
  });
});

describe('AdminService Integration', () => {
  // These would be integration tests that test with a real database
  // For now, we'll skip them in the unit test suite
  it.skip('should integrate with real database', () => {
    // Integration test implementation
  });
});