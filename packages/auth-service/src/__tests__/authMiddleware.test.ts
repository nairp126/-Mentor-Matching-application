import { Request, Response, NextFunction } from 'express';
import { AuthMiddleware } from '../middleware/authMiddleware';
import { AuthUtils, UserRole } from '@mentor-platform/shared';
import { AppError } from '../middleware/errorHandler';

// Mock the AuthUtils
jest.mock('@mentor-platform/shared', () => ({
  ...jest.requireActual('@mentor-platform/shared'),
  AuthUtils: {
    validateToken: jest.fn()
  }
}));

const mockAuthUtils = AuthUtils as jest.Mocked<typeof AuthUtils>;

describe('AuthMiddleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      user: undefined,
      params: {},
      body: {}
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate valid token', () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };
      
      mockAuthUtils.validateToken.mockReturnValue({
        valid: true,
        userId: 'user-123',
        role: 'STUDENT' as UserRole
      });

      const middleware = AuthMiddleware.authenticate();

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockAuthUtils.validateToken).toHaveBeenCalledWith('valid-token');
      expect(mockRequest.user).toEqual({
        userId: 'user-123',
        role: 'STUDENT',
        permissions: expect.arrayContaining([
          'user:read:own',
          'user:write:own',
          'session:read',
          'session:register',
          'message:read:own',
          'message:write',
          'notification:read:own'
        ])
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject request without authorization header', () => {
      // Arrange
      const middleware = AuthMiddleware.authenticate();

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authorization token is required',
          statusCode: 401,
          code: 'MISSING_TOKEN'
        })
      );
    });

    it('should reject request with invalid token format', () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Invalid token-format'
      };
      
      const middleware = AuthMiddleware.authenticate();

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authorization token is required',
          statusCode: 401,
          code: 'MISSING_TOKEN'
        })
      );
    });

    it('should reject invalid token', () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };
      
      mockAuthUtils.validateToken.mockReturnValue({
        valid: false
      });

      const middleware = AuthMiddleware.authenticate();

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid or expired token',
          statusCode: 401,
          code: 'INVALID_TOKEN'
        })
      );
    });
  });

  describe('requireRole', () => {
    beforeEach(() => {
      mockRequest.user = {
        userId: 'user-123',
        role: 'STUDENT' as UserRole,
        permissions: ['user:read:own', 'session:read']
      };
    });

    it('should allow access for matching role', () => {
      // Arrange
      const middleware = AuthMiddleware.requireRole('STUDENT');

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow access for multiple allowed roles', () => {
      // Arrange
      const middleware = AuthMiddleware.requireRole(['STUDENT', 'MENTOR']);

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access for non-matching role', () => {
      // Arrange
      const middleware = AuthMiddleware.requireRole('ADMIN');

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Insufficient permissions for this resource',
          statusCode: 403,
          code: 'INSUFFICIENT_PERMISSIONS',
          details: {
            requiredRoles: ['ADMIN'],
            userRole: 'STUDENT'
          }
        })
      );
    });

    it('should require authentication first', () => {
      // Arrange
      mockRequest.user = undefined;
      const middleware = AuthMiddleware.requireRole('STUDENT');

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication required',
          statusCode: 401,
          code: 'AUTHENTICATION_REQUIRED'
        })
      );
    });
  });

  describe('requirePermission', () => {
    beforeEach(() => {
      mockRequest.user = {
        userId: 'user-123',
        role: 'STUDENT' as UserRole,
        permissions: ['user:read:own', 'session:read', 'message:write']
      };
    });

    it('should allow access for exact permission match', () => {
      // Arrange
      const middleware = AuthMiddleware.requirePermission('session:read');

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow access for wildcard permission', () => {
      // Arrange
      mockRequest.user!.permissions = ['user:*', 'session:read'];
      const middleware = AuthMiddleware.requirePermission('user:write');

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access for missing permission', () => {
      // Arrange
      const middleware = AuthMiddleware.requirePermission('admin:read');

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Insufficient permissions for this action',
          statusCode: 403,
          code: 'INSUFFICIENT_PERMISSIONS',
          details: {
            requiredPermission: 'admin:read',
            userPermissions: ['user:read:own', 'session:read', 'message:write']
          }
        })
      );
    });

    it('should require authentication first', () => {
      // Arrange
      mockRequest.user = undefined;
      const middleware = AuthMiddleware.requirePermission('session:read');

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication required',
          statusCode: 401,
          code: 'AUTHENTICATION_REQUIRED'
        })
      );
    });
  });

  describe('requireOwnership', () => {
    beforeEach(() => {
      mockRequest.user = {
        userId: 'user-123',
        role: 'STUDENT' as UserRole,
        permissions: ['user:read:own']
      };
      mockRequest.params = { id: 'user-123' };
    });

    it('should allow admin access to any resource', async () => {
      // Arrange
      mockRequest.user!.role = 'ADMIN';
      mockRequest.params = { id: 'other-user-456' };
      const middleware = AuthMiddleware.requireOwnership('user');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow access to own resource', async () => {
      // Arrange
      const middleware = AuthMiddleware.requireOwnership('user');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access to other user resource', async () => {
      // Arrange
      mockRequest.params = { id: 'other-user-456' };
      const middleware = AuthMiddleware.requireOwnership('user');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'You can only access your own resources',
          statusCode: 403,
          code: 'RESOURCE_ACCESS_DENIED',
          details: {
            resourceType: 'user',
            resourceId: 'other-user-456',
            userId: 'user-123'
          }
        })
      );
    });

    it('should require resource ID parameter', async () => {
      // Arrange
      mockRequest.params = {};
      mockRequest.body = {};
      const middleware = AuthMiddleware.requireOwnership('user');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Resource ID parameter 'id' is required",
          statusCode: 400,
          code: 'MISSING_RESOURCE_ID'
        })
      );
    });

    it('should handle custom resource ID parameter', async () => {
      // Arrange
      mockRequest.params = { userId: 'user-123' };
      delete mockRequest.params.id;
      const middleware = AuthMiddleware.requireOwnership('user', 'userId');

      // Act
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('utility methods', () => {
    it('should return correct permissions for role', () => {
      // Act & Assert
      const adminPermissions = AuthMiddleware.getPermissionsForRole('ADMIN');
      expect(adminPermissions).toContain('user:read');
      expect(adminPermissions).toContain('user:write');
      expect(adminPermissions).toContain('system:admin');

      const studentPermissions = AuthMiddleware.getPermissionsForRole('STUDENT');
      expect(studentPermissions).toContain('user:read:own');
      expect(studentPermissions).toContain('session:read');
      expect(studentPermissions).not.toContain('system:admin');
    });

    it('should check role permissions correctly', () => {
      // Act & Assert
      expect(AuthMiddleware.roleHasPermission('ADMIN', 'user:read')).toBe(true);
      expect(AuthMiddleware.roleHasPermission('STUDENT', 'user:read:own')).toBe(true);
      expect(AuthMiddleware.roleHasPermission('STUDENT', 'system:admin')).toBe(false);
    });
  });

  describe('combined middleware', () => {
    it('should create authentication and authorization middleware', () => {
      // Act
      const middleware = AuthMiddleware.authenticateAndAuthorize(['ADMIN', 'MENTOR']);

      // Assert
      expect(middleware).toHaveLength(2);
      expect(typeof middleware[0]).toBe('function');
      expect(typeof middleware[1]).toBe('function');
    });

    it('should create authentication and permission middleware', () => {
      // Act
      const middleware = AuthMiddleware.authenticateAndRequirePermission('user:read');

      // Assert
      expect(middleware).toHaveLength(2);
      expect(typeof middleware[0]).toBe('function');
      expect(typeof middleware[1]).toBe('function');
    });

    it('should create authentication and ownership middleware', () => {
      // Act
      const middleware = AuthMiddleware.authenticateAndRequireOwnership('user');

      // Assert
      expect(middleware).toHaveLength(2);
      expect(typeof middleware[0]).toBe('function');
      expect(typeof middleware[1]).toBe('function');
    });
  });
});