import request from 'supertest';
import { DatabaseManager } from '@mentor-platform/shared';
import app from '../index';

// Mock the database manager
jest.mock('@mentor-platform/shared', () => {
  const mockDbInstance = {
    query: jest.fn(),
    cache: jest.fn(),
    getCached: jest.fn(),
    deleteCached: jest.fn(),
    close: jest.fn()
  };
  
  return {
    ...jest.requireActual('@mentor-platform/shared'),
    DatabaseManager: jest.fn().mockImplementation(() => mockDbInstance),
    __mockDbInstance: mockDbInstance // Export for test access
  };
});

describe('Role-Based Access Control Integration Tests', () => {
  let adminToken: string;
  let mentorToken: string;
  let studentToken: string;
  let mockQuery: jest.Mock;
  let mockGetCached: jest.Mock;
  let mockCache: jest.Mock;
  let mockDeleteCached: jest.Mock;

  beforeAll(() => {
    // Create mock tokens for different roles
    const { AuthUtils, __mockDbInstance } = require('@mentor-platform/shared');
    adminToken = AuthUtils.generateAccessToken('admin-123', 'ADMIN');
    mentorToken = AuthUtils.generateAccessToken('mentor-123', 'MENTOR');
    studentToken = AuthUtils.generateAccessToken('student-123', 'STUDENT');
    
    // Get references to the mock functions
    mockQuery = __mockDbInstance.query;
    mockGetCached = __mockDbInstance.getCached;
    mockCache = __mockDbInstance.cache;
    mockDeleteCached = __mockDbInstance.deleteCached;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default database mocks
    mockQuery.mockImplementation((query: string, params?: any[]) => {
      console.log('Mock query called with:', query, params);
      
      // Mock user queries for /me endpoint
      if (query.includes('SELECT id, email, role') && query.includes('FROM users WHERE id = $1')) {
        const userId = params?.[0];
        console.log('User query for userId:', userId);
        if (userId === 'student-123') {
          return Promise.resolve({
            rows: [{
              id: 'student-123',
              email: 'student@example.com',
              role: 'STUDENT',
              email_verified: true,
              mfa_enabled: false,
              created_at: new Date(),
              updated_at: new Date(),
              last_login_at: null
            }]
          });
        }
        if (userId === 'admin-123') {
          return Promise.resolve({
            rows: [{
              id: 'admin-123',
              email: 'admin@example.com',
              role: 'ADMIN',
              email_verified: true,
              mfa_enabled: false,
              created_at: new Date(),
              updated_at: new Date(),
              last_login_at: null
            }]
          });
        }
      }
      
      // Mock users list query for /users endpoint
      if (query.includes('SELECT id, email, role') && query.includes('FROM users') && query.includes('ORDER BY created_at DESC')) {
        return Promise.resolve({
          rows: [{
            id: 'user-123',
            email: 'user@example.com',
            role: 'STUDENT',
            email_verified: true,
            mfa_enabled: false,
            created_at: new Date(),
            updated_at: new Date(),
            last_login_at: null
          }]
        });
      }
      
      // Mock count query for /users endpoint
      if (query.includes('SELECT COUNT(*) as total FROM users')) {
        return Promise.resolve({
          rows: [{ total: '1' }]
        });
      }
      
      // Mock user role update queries
      if (query.includes('SELECT role FROM users WHERE id = $1')) {
        return Promise.resolve({
          rows: [{ role: 'STUDENT' }]
        });
      }
      
      if (query.includes('UPDATE users SET role = $1')) {
        return Promise.resolve({
          rows: [{
            id: 'user-123',
            email: 'user@example.com',
            role: 'MENTOR',
            updated_at: new Date()
          }]
        });
      }
      
      // Mock security events query for /security/stats endpoint
      if (query.includes('SELECT event_type, COUNT(*) as count FROM security_events')) {
        return Promise.resolve({
          rows: [
            { event_type: 'LOGIN_SUCCESS', count: '10' },
            { event_type: 'LOGIN_FAILED', count: '2' }
          ]
        });
      }
      
      // Mock audit log insertion
      if (query.includes('INSERT INTO audit_logs')) {
        return Promise.resolve({ rows: [] });
      }
      
      return Promise.resolve({ rows: [] });
    });
    
    // Mock security service methods
    mockGetCached.mockImplementation((key: string) => {
      if (key.includes('security_events')) {
        return Promise.resolve([
          { eventType: 'LOGIN_ATTEMPT', timestamp: new Date() },
          { eventType: 'FAILED_LOGIN', timestamp: new Date() }
        ]);
      }
      return Promise.resolve(null);
    });
  });

  describe('Authentication Requirements', () => {
    it('should reject requests without authentication token', async () => {
      const response = await request(app)
        .get('/me')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authorization token is required'
        }
      });
    });

    it('should reject requests with invalid token format', async () => {
      const response = await request(app)
        .get('/me')
        .set('Authorization', 'Invalid token-format')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authorization token is required'
        }
      });
    });

    it('should accept requests with valid token', async () => {
      const response = await request(app)
        .get('/me')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe('student-123');
    });
  });

  describe('Role-Based Access Control', () => {
    it('should allow admin access to security stats', async () => {
      // Mock security service method
      const mockSecurityService = {
        getSecurityEventStats: jest.fn().mockResolvedValue([
          { eventType: 'LOGIN_SUCCESS', count: 10 },
          { eventType: 'LOGIN_FAILED', count: 2 }
        ])
      };

      // Mock AuthService to return the mock security service
      jest.doMock('../services/authService', () => ({
        AuthService: jest.fn().mockImplementation(() => ({
          getSecurityService: () => mockSecurityService
        }))
      }));

      const response = await request(app)
        .get('/security/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.events).toEqual({
        'LOGIN_SUCCESS': 10,
        'LOGIN_FAILED': 2
      });
    });

    it('should deny student access to security stats', async () => {
      const response = await request(app)
        .get('/security/stats')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Insufficient permissions for this resource'
        }
      });
    });

    it('should deny mentor access to security stats', async () => {
      const response = await request(app)
        .get('/security/stats')
        .set('Authorization', `Bearer ${mentorToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Insufficient permissions for this resource'
        }
      });
    });

    it('should allow admin access to users list', async () => {
      const response = await request(app)
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(1);
      expect(response.body.data.pagination).toBeDefined();
    });

    it('should deny student access to users list', async () => {
      const response = await request(app)
        .get('/users')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS'
        }
      });
    });

    it('should allow admin to update user roles', async () => {
      const response = await request(app)
        .put('/users/user-123/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'MENTOR' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.role).toBe('MENTOR');
    });

    it('should deny student access to update user roles', async () => {
      const response = await request(app)
        .put('/users/user-123/role')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ role: 'MENTOR' })
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS'
        }
      });
    });
  });

  describe('Permission-Based Access Control', () => {
    it('should allow users to access their own permissions', async () => {
      const response = await request(app)
        .get('/permissions')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBe('student-123');
      expect(response.body.data.role).toBe('STUDENT');
      expect(response.body.data.permissions).toContain('user:read:own');
      expect(response.body.data.permissions).toContain('session:read');
    });

    it('should show different permissions for different roles', async () => {
      const adminResponse = await request(app)
        .get('/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const studentResponse = await request(app)
        .get('/permissions')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(adminResponse.body.data.permissions).toContain('system:admin');
      expect(adminResponse.body.data.permissions).toContain('user:write');
      
      expect(studentResponse.body.data.permissions).not.toContain('system:admin');
      expect(studentResponse.body.data.permissions).not.toContain('user:write');
      expect(studentResponse.body.data.permissions).toContain('user:read:own');
    });
  });

  describe('Token Validation', () => {
    it('should validate tokens and return user info', async () => {
      const response = await request(app)
        .get('/validate-token')
        .set('Authorization', `Bearer ${mentorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        valid: true,
        userId: 'mentor-123',
        role: 'MENTOR',
        permissions: expect.arrayContaining([
          'user:read:own',
          'session:write:own',
          'message:write'
        ])
      });
    });

    it('should include permissions in token validation response', async () => {
      const response = await request(app)
        .get('/validate-token')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.permissions).toContain('system:admin');
      expect(response.body.data.permissions).toContain('user:read');
      expect(response.body.data.permissions).toContain('security:read');
    });
  });

  describe('Audit Logging', () => {
    it('should log access attempts for sensitive operations', async () => {
      // Mock console.log to capture audit logs
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await request(app)
        .get('/permissions')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Access audit:',
        expect.objectContaining({
          userId: 'student-123',
          role: 'STUDENT',
          action: 'PERMISSIONS_ACCESS',
          resource: '/permissions',
          method: 'GET'
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should return proper error format for authorization failures', async () => {
      const response = await request(app)
        .get('/security/stats')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: expect.any(String),
          details: expect.objectContaining({
            requiredRoles: ['ADMIN'],
            userRole: 'STUDENT'
          })
        },
        timestamp: expect.any(String)
      });
    });

    it('should return proper error format for missing permissions', async () => {
      const response = await request(app)
        .get('/users')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: expect.any(String),
          details: expect.objectContaining({
            requiredPermission: 'user:read',
            userPermissions: expect.arrayContaining(['user:read:own'])
          })
        },
        timestamp: expect.any(String)
      });
    });
  });
});