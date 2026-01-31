import { Request, Response, NextFunction } from 'express';
import { AuthUtils, UserRole } from '@mentor-platform/shared';
import { AppError } from './errorHandler';

// Extend Request interface to include admin user information
declare global {
  namespace Express {
    interface Request {
      admin?: {
        userId: string;
        role: UserRole;
        permissions: string[];
      };
    }
  }
}

// Admin-specific permissions
const ADMIN_PERMISSIONS = [
  'admin:dashboard',
  'admin:users:read',
  'admin:users:write',
  'admin:users:delete',
  'admin:users:suspend',
  'admin:users:activate',
  'admin:sessions:read',
  'admin:sessions:write',
  'admin:sessions:delete',
  'admin:metrics:read',
  'admin:audit:read',
  'admin:system:read',
  'admin:system:write',
  'admin:notifications:send',
  'admin:reports:generate'
];

/**
 * Admin authentication middleware - validates JWT token and ensures ADMIN role
 */
export const adminAuthMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(
      'Admin authorization token is required',
      401,
      'MISSING_ADMIN_TOKEN'
    ));
  }

  const token = authHeader.substring(7);
  const validation = AuthUtils.validateToken(token);

  if (!validation.valid) {
    return next(new AppError(
      'Invalid or expired admin token',
      401,
      'INVALID_ADMIN_TOKEN'
    ));
  }

  // Ensure user has ADMIN role
  if (validation.role !== 'ADMIN') {
    return next(new AppError(
      'Admin access required - insufficient privileges',
      403,
      'ADMIN_ACCESS_REQUIRED',
      { 
        userRole: validation.role,
        requiredRole: 'ADMIN'
      }
    ));
  }

  // Add admin information to request
  req.admin = {
    userId: validation.userId!,
    role: validation.role!,
    permissions: ADMIN_PERMISSIONS
  };

  // Log admin access for audit trail
  console.log('Admin access:', {
    adminId: req.admin.userId,
    action: `${req.method} ${req.originalUrl}`,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  next();
};

/**
 * Admin permission middleware - checks for specific admin permissions
 */
export const requireAdminPermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      return next(new AppError(
        'Admin authentication required',
        401,
        'ADMIN_AUTHENTICATION_REQUIRED'
      ));
    }

    if (!req.admin.permissions.includes(permission)) {
      return next(new AppError(
        'Insufficient admin permissions for this action',
        403,
        'INSUFFICIENT_ADMIN_PERMISSIONS',
        { 
          requiredPermission: permission,
          adminPermissions: req.admin.permissions 
        }
      ));
    }

    next();
  };
};

/**
 * Audit logging middleware for admin actions
 */
export const auditAdminAction = (action: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Store original res.json to intercept response
    const originalJson = res.json;
    
    res.json = function(body: any) {
      // Log the admin action with result
      const auditData = {
        adminId: req.admin?.userId,
        action,
        resource: req.originalUrl,
        method: req.method,
        requestBody: req.body,
        responseStatus: res.statusCode,
        success: res.statusCode < 400,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      };

      console.log('Admin action audit:', auditData);
      
      // In production, store this in audit database
      // await auditService.logAdminAction(auditData);
      
      return originalJson.call(this, body);
    };

    next();
  };
};

/**
 * Rate limiting middleware for admin actions
 */
export const adminRateLimit = (maxRequests: number = 100, windowMs: number = 60000) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      return next();
    }

    const key = req.admin.userId;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    for (const [userId, data] of requests.entries()) {
      if (data.resetTime < windowStart) {
        requests.delete(userId);
      }
    }

    const userRequests = requests.get(key);
    
    if (!userRequests) {
      requests.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (userRequests.resetTime < now) {
      // Reset window
      requests.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (userRequests.count >= maxRequests) {
      return next(new AppError(
        'Admin rate limit exceeded',
        429,
        'ADMIN_RATE_LIMIT_EXCEEDED',
        {
          maxRequests,
          windowMs,
          resetTime: userRequests.resetTime
        }
      ));
    }

    userRequests.count++;
    next();
  };
};