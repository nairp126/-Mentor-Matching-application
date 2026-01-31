import { Request, Response, NextFunction } from 'express';
import { AuthUtils, UserRole } from '@mentor-platform/shared';
import { AppError } from './errorHandler';

// Using global Express Request extension from @mentor-platform/shared

// Define permissions for each role
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  ADMIN: [
    'user:read',
    'user:write',
    'user:delete',
    'session:read',
    'session:write',
    'session:delete',
    'system:admin',
    'security:read',
    'audit:read'
  ],
  MENTOR: [
    'user:read:own',
    'user:write:own',
    'session:read',
    'session:write:own',
    'session:delete:own',
    'message:read:own',
    'message:write',
    'notification:read:own'
  ],
  STUDENT: [
    'user:read:own',
    'user:write:own',
    'session:read',
    'session:register',
    'message:read:own',
    'message:write',
    'notification:read:own'
  ]
};

// Resource ownership check functions
const OWNERSHIP_CHECKS: Record<string, (userId: string, resourceId: string, req: Request) => Promise<boolean>> = {
  'user': async (userId: string, resourceId: string) => userId === resourceId,
  'session': async (userId: string, resourceId: string, req: Request) => {
    // This would typically check database to see if user owns the session
    // For now, we'll implement a basic check
    return req.params.mentorId === userId || req.body.mentorId === userId;
  },
  'message': async (userId: string, resourceId: string, req: Request) => {
    // Check if user is participant in the conversation
    // This would require database lookup in real implementation
    return true; // Placeholder
  }
};

/**
 * Enhanced authentication middleware with role-based access control
 */
export class AuthMiddleware {
  /**
   * Basic authentication middleware - validates JWT token
   */
  static authenticate() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new AppError(
          'Authorization token is required',
          401,
          'MISSING_TOKEN'
        ));
      }

      const token = authHeader.substring(7);
      const validation = AuthUtils.validateToken(token);

      if (!validation.valid) {
        return next(new AppError(
          'Invalid or expired token',
          401,
          'INVALID_TOKEN'
        ));
      }

      // Add user information to request
      req.user = {
        userId: validation.userId!,
        role: validation.role!,
        permissions: ROLE_PERMISSIONS[validation.role!] || []
      };

      next();
    };
  }

  /**
   * Role-based authorization middleware
   */
  static requireRole(allowedRoles: UserRole | UserRole[]) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        return next(new AppError(
          'Authentication required',
          401,
          'AUTHENTICATION_REQUIRED'
        ));
      }

      if (!roles.includes(req.user.role)) {
        return next(new AppError(
          'Insufficient permissions for this resource',
          403,
          'INSUFFICIENT_PERMISSIONS',
          { 
            requiredRoles: roles,
            userRole: req.user.role 
          }
        ));
      }

      next();
    };
  }

  /**
   * Permission-based authorization middleware
   */
  static requirePermission(permission: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        return next(new AppError(
          'Authentication required',
          401,
          'AUTHENTICATION_REQUIRED'
        ));
      }

      const userPermissions = req.user.permissions || [];
      
      // Check for exact permission match
      if (userPermissions.includes(permission)) {
        return next();
      }

      // Check for wildcard permissions (e.g., user:* includes user:read)
      const wildcardPermission = permission.split(':')[0] + ':*';
      if (userPermissions.includes(wildcardPermission)) {
        return next();
      }

      return next(new AppError(
        'Insufficient permissions for this action',
        403,
        'INSUFFICIENT_PERMISSIONS',
        { 
          requiredPermission: permission,
          userPermissions: userPermissions 
        }
      ));
    };
  }

  /**
   * Resource ownership authorization middleware
   */
  static requireOwnership(resourceType: string, resourceIdParam: string = 'id') {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user) {
        return next(new AppError(
          'Authentication required',
          401,
          'AUTHENTICATION_REQUIRED'
        ));
      }

      // Admin users can access any resource
      if (req.user.role === 'ADMIN') {
        return next();
      }

      const resourceId = req.params[resourceIdParam] || req.body[resourceIdParam];
      if (!resourceId) {
        return next(new AppError(
          `Resource ID parameter '${resourceIdParam}' is required`,
          400,
          'MISSING_RESOURCE_ID'
        ));
      }

      try {
        const ownershipCheck = OWNERSHIP_CHECKS[resourceType];
        if (!ownershipCheck) {
          return next(new AppError(
            `Ownership check not implemented for resource type: ${resourceType}`,
            500,
            'OWNERSHIP_CHECK_NOT_IMPLEMENTED'
          ));
        }

        const isOwner = await ownershipCheck(req.user.userId, resourceId, req);
        if (!isOwner) {
          return next(new AppError(
            'You can only access your own resources',
            403,
            'RESOURCE_ACCESS_DENIED',
            { 
              resourceType,
              resourceId,
              userId: req.user.userId 
            }
          ));
        }

        next();
      } catch (error) {
        next(new AppError(
          'Error checking resource ownership',
          500,
          'OWNERSHIP_CHECK_ERROR'
        ));
      }
    };
  }

  /**
   * Combined middleware for authentication and role checking
   */
  static authenticateAndAuthorize(allowedRoles?: UserRole | UserRole[]) {
    return [
      AuthMiddleware.authenticate(),
      ...(allowedRoles ? [AuthMiddleware.requireRole(allowedRoles)] : [])
    ];
  }

  /**
   * Combined middleware for authentication, role checking, and permission verification
   */
  static authenticateAndRequirePermission(permission: string) {
    return [
      AuthMiddleware.authenticate(),
      AuthMiddleware.requirePermission(permission)
    ];
  }

  /**
   * Combined middleware for authentication and ownership verification
   */
  static authenticateAndRequireOwnership(resourceType: string, resourceIdParam?: string) {
    return [
      AuthMiddleware.authenticate(),
      AuthMiddleware.requireOwnership(resourceType, resourceIdParam)
    ];
  }

  /**
   * Get user permissions for a given role
   */
  static getPermissionsForRole(role: UserRole): string[] {
    return ROLE_PERMISSIONS[role] || [];
  }

  /**
   * Check if a role has a specific permission
   */
  static roleHasPermission(role: UserRole, permission: string): boolean {
    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes(permission) || permissions.includes(permission.split(':')[0] + ':*');
  }
}

/**
 * Audit middleware to log access attempts
 */
export const auditMiddleware = (action: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Log the access attempt
    const auditData = {
      userId: req.user?.userId,
      role: req.user?.role,
      action,
      resource: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    };

    console.log('Access audit:', auditData);
    
    // In a production system, you would store this in a database or audit log service
    // For now, we'll just log to console
    
    next();
  };
};

/**
 * Middleware to validate API key for external service access
 */
export const apiKeyMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    return next(new AppError(
      'API key is required',
      401,
      'MISSING_API_KEY'
    ));
  }

  // In production, you would validate against a database of valid API keys
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
  
  if (!validApiKeys.includes(apiKey)) {
    return next(new AppError(
      'Invalid API key',
      401,
      'INVALID_API_KEY'
    ));
  }

  // Add API key info to request for logging
  (req as any).apiKey = apiKey;
  
  next();
};