import { Router, Request, Response, NextFunction } from 'express';
import {
  DatabaseManager,
  userRegistrationSchema,
  loginCredentialsSchema,
  mfaCodeSchema,
  AuthUtils,
  validateSchema
} from '@mentor-platform/shared';
import { AuthService } from '../services/authService';
import { AppError } from '../middleware/errorHandler';
import { AuthMiddleware, auditMiddleware } from '../middleware/authMiddleware';

// Temporary validation middleware until import issue is resolved
const createValidationMiddleware = (schema: any) => {
  return (req: any, res: any, next: any): void => {
    const { error, value } = validateSchema(schema, req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.details.map((detail: any) => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        },
        timestamp: new Date().toISOString()
      });
    }
    req.body = value;
    next();
  };
};

export const authRoutes = (db: DatabaseManager): Router => {
  const router = Router();
  const authService = new AuthService(db);

  /**
   * POST /register
   * Register a new user
   */
  router.post('/register',
    createValidationMiddleware(userRegistrationSchema),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = await authService.register(req.body);

        res.status(201).json({
          success: true,
          data: {
            message: 'Registration successful',
            userId: result.user.id,
            user: result.user,
            token: result.token,
            refreshToken: result.refreshToken
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /login
   * Login user with credentials
   */
  router.post('/login',
    createValidationMiddleware(loginCredentialsSchema),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Extract security context
        const securityContext = authService.getSecurityService().extractSecurityContext(req);

        const authResult = await authService.login(
          req.body,
          securityContext.ipAddress,
          securityContext.userAgent
        );

        // Remove password hash from user object before sending response
        const { passwordHash, ...userWithoutPassword } = authResult.user;

        res.json({
          success: true,
          data: {
            ...authResult,
            user: userWithoutPassword
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /refresh
   * Refresh access token using refresh token
   */
  router.post('/refresh',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
          throw new AppError('Refresh token is required');
        }

        const authResult = await authService.refreshToken(refreshToken);

        // Remove password hash from user object before sending response
        const { passwordHash, ...userWithoutPassword } = authResult.user;

        res.json({
          success: true,
          data: {
            ...authResult,
            user: userWithoutPassword
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /logout
   * Logout user by invalidating refresh token
   */
  router.post('/logout',
    ...AuthMiddleware.authenticateAndAuthorize(),
    auditMiddleware('USER_LOGOUT'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user!.userId;
        await authService.logout(userId);

        res.json({
          success: true,
          data: {
            message: 'Logged out successfully'
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /verify-email/:token
   * Verify user email with verification token
   */
  router.get('/verify-email/:token',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { token } = req.params;
        const result = await authService.verifyEmail(token);

        res.json({
          success: true,
          data: {
            message: result.message
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /forgot-password
   * Request password reset email
   */
  router.post('/forgot-password',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { email } = req.body;

        if (!email) {
          throw new AppError('Email is required');
        }

        const result = await authService.requestPasswordReset(email);

        res.json({
          success: true,
          data: {
            message: result.message
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /validate-token
   * Validate access token (for internal service use)
   */
  router.get('/validate-token',
    AuthMiddleware.authenticate(),
    auditMiddleware('TOKEN_VALIDATION'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user = req.user!;

        res.json({
          success: true,
          data: {
            valid: true,
            userId: user.userId,
            role: user.role,
            permissions: user.permissions
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /me
   * Get current user information
   */
  router.get('/me',
    AuthMiddleware.authenticate(),
    AuthMiddleware.requirePermission('user:read:own'),
    auditMiddleware('USER_PROFILE_ACCESS'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user!.userId;

        // Get user from database
        const query = `
          SELECT id, email, role, email_verified, mfa_enabled, created_at, updated_at, last_login_at
          FROM users 
          WHERE id = $1
        `;

        const result = await db.query(query, [userId]);
        if (result.rows.length === 0) {
          throw new AppError('User not found', 404);
        }

        const user = result.rows[0];

        res.json({
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              role: user.role,
              emailVerified: user.email_verified,
              mfaEnabled: user.mfa_enabled,
              createdAt: user.created_at,
              updatedAt: user.updated_at,
              lastLoginAt: user.last_login_at
            }
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /security/stats
   * Get security event statistics (admin only)
   */
  router.get('/security/stats',
    AuthMiddleware.authenticate(),
    AuthMiddleware.requireRole('ADMIN'),
    AuthMiddleware.requirePermission('security:read'),
    auditMiddleware('SECURITY_STATS_ACCESS'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const timeWindow = parseInt(req.query.hours as string) || 24;
        const stats = await authService.getSecurityService().getSecurityEventStats(timeWindow);

        res.json({
          success: true,
          data: {
            timeWindow: `${timeWindow} hours`,
            events: stats
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /users
   * Get all users (admin only)
   */
  router.get('/users',
    AuthMiddleware.authenticate(),
    AuthMiddleware.requireRole('ADMIN'),
    AuthMiddleware.requirePermission('user:read'),
    auditMiddleware('USERS_LIST_ACCESS'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;

        const query = `
          SELECT id, email, role, email_verified, mfa_enabled, created_at, updated_at, last_login_at
          FROM users 
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2
        `;

        const countQuery = 'SELECT COUNT(*) as total FROM users';

        const [usersResult, countResult] = await Promise.all([
          db.query(query, [limit, offset]),
          db.query(countQuery)
        ]);

        const users = usersResult.rows.map((user: any) => ({
          id: user.id,
          email: user.email,
          role: user.role,
          emailVerified: user.email_verified,
          mfaEnabled: user.mfa_enabled,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          lastLoginAt: user.last_login_at
        }));

        const total = parseInt(countResult.rows[0].total);

        res.json({
          success: true,
          data: {
            users,
            pagination: {
              page,
              limit,
              total,
              totalPages: Math.ceil(total / limit),
              hasNext: page * limit < total,
              hasPrev: page > 1
            }
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * PUT /users/:userId/role
   * Update user role (admin only)
   */
  router.put('/users/:userId/role',
    AuthMiddleware.authenticate(),
    AuthMiddleware.requireRole('ADMIN'),
    AuthMiddleware.requirePermission('user:write'),
    auditMiddleware('USER_ROLE_UPDATE'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { userId } = req.params;
        const { role } = req.body;

        if (!role || !['MENTOR', 'STUDENT', 'ADMIN'].includes(role)) {
          throw new AppError('Valid role is required (MENTOR, STUDENT, or ADMIN)');
        }

        // Get current user data for audit log
        const currentUserQuery = 'SELECT role FROM users WHERE id = $1';
        const currentUserResult = await db.query(currentUserQuery, [userId]);

        if (currentUserResult.rows.length === 0) {
          throw new AppError('User not found', 404);
        }

        const oldRole = currentUserResult.rows[0].role;

        // Update user role
        const updateQuery = `
          UPDATE users 
          SET role = $1, updated_at = NOW()
          WHERE id = $2
          RETURNING id, email, role, updated_at
        `;

        const result = await db.query(updateQuery, [role, userId]);
        const updatedUser = result.rows[0];

        // Log the role change
        await authService.logAuditEvent(
          req.user!.userId,
          'USER_ROLE_UPDATED',
          'user',
          userId,
          { role: oldRole },
          { role: role }
        );

        res.json({
          success: true,
          data: {
            message: 'User role updated successfully',
            user: {
              id: updatedUser.id,
              email: updatedUser.email,
              role: updatedUser.role,
              updatedAt: updatedUser.updated_at
            }
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /mfa/setup
   * Setup MFA for the current user
   */
  router.post('/mfa/setup',
    ...AuthMiddleware.authenticateAndAuthorize(),
    auditMiddleware('MFA_SETUP_INITIATED'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user!.userId;

        // Get user email for QR code generation
        const userQuery = 'SELECT email FROM users WHERE id = $1';
        const userResult = await db.query(userQuery, [userId]);

        if (userResult.rows.length === 0) {
          throw new AppError('User not found', 404);
        }

        const userEmail = userResult.rows[0].email;
        const mfaService = authService.getMFAService();
        const setupResult = await mfaService.setupMFA(userId, userEmail);

        res.json({
          success: true,
          data: {
            secret: setupResult.secret,
            qrCodeUrl: setupResult.qrCodeUrl,
            backupCodes: setupResult.backupCodes,
            message: 'MFA setup initiated. Please verify with your authenticator app to enable.'
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /mfa/enable
   * Enable MFA after verification
   */
  router.post('/mfa/enable',
    createValidationMiddleware(mfaCodeSchema),
    ...AuthMiddleware.authenticateAndAuthorize(),
    auditMiddleware('MFA_ENABLED'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user!.userId;
        const { code } = req.body;

        const mfaService = authService.getMFAService();
        await mfaService.enableMFA(userId, code);

        res.json({
          success: true,
          data: {
            message: 'MFA enabled successfully'
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /mfa/disable
   * Disable MFA for the current user
   */
  router.post('/mfa/disable',
    createValidationMiddleware(mfaCodeSchema),
    ...AuthMiddleware.authenticateAndAuthorize(),
    auditMiddleware('MFA_DISABLED'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user!.userId;
        const { code } = req.body;

        const mfaService = authService.getMFAService();
        await mfaService.disableMFA(userId, code);

        res.json({
          success: true,
          data: {
            message: 'MFA disabled successfully'
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /mfa/status
   * Get MFA status for the current user
   */
  router.get('/mfa/status',
    ...AuthMiddleware.authenticateAndAuthorize(),
    auditMiddleware('MFA_STATUS_CHECK'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user!.userId;
        const mfaService = authService.getMFAService();
        const status = await mfaService.getMFAStatus(userId);

        res.json({
          success: true,
          data: status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /mfa/backup-codes/regenerate
   * Generate new backup codes
   */
  router.post('/mfa/backup-codes/regenerate',
    createValidationMiddleware(mfaCodeSchema),
    ...AuthMiddleware.authenticateAndAuthorize(),
    auditMiddleware('MFA_BACKUP_CODES_REGENERATED'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user!.userId;
        const { code } = req.body;

        const mfaService = authService.getMFAService();
        const backupCodes = await mfaService.generateNewBackupCodes(userId, code);

        res.json({
          success: true,
          data: {
            backupCodes,
            message: 'New backup codes generated successfully'
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /permissions
   * Get current user's permissions
   */
  router.get('/permissions',
    AuthMiddleware.authenticate(),
    auditMiddleware('PERMISSIONS_ACCESS'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user = req.user!;

        res.json({
          success: true,
          data: {
            userId: user.userId,
            role: user.role,
            permissions: user.permissions || []
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};