import { v4 as uuidv4 } from 'uuid';
import {
  DatabaseManager,
  AuthUtils,
  User,
  UserRegistration,
  LoginCredentials,
  AuthResult,
  UserRole
} from '@mentor-platform/shared';
import { EmailService } from './emailService';
import { SecurityService } from './securityService';
import { MFAService } from './mfaService';
import { AppError } from '../middleware/errorHandler';

export interface UserProfile {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class AuthService {
  private db: DatabaseManager;
  private emailService: EmailService;
  private securityService: SecurityService;
  private mfaService: MFAService;

  constructor(db: DatabaseManager) {
    this.db = db;
    this.emailService = new EmailService();
    this.securityService = new SecurityService(db);
    this.mfaService = new MFAService(db);
  }

  /**
   * Register a new user
   */
  async register(userData: UserRegistration): Promise<{ user: UserProfile; token: string; refreshToken: string }> {
    // Hash password
    const passwordHash = await AuthUtils.hashPassword(userData.password);

    // Check if user exists
    const existingUser = await this.db.query('SELECT id FROM users WHERE email = $1', [userData.email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      throw new AppError('User with this email already exists');
    }

    try {
      await this.db.query('BEGIN');

      const query = `
        INSERT INTO users (
          id, email, password_hash, role, email_verified, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING id, email, role, email_verified, created_at, updated_at, last_login_at
      `;

      const result = await this.db.query(query, [
        uuidv4(),
        userData.email.toLowerCase(),
        passwordHash,
        userData.role,
        process.env.NODE_ENV === 'development' // Auto-verify in development
      ]);

      const user = result.rows[0];

      // Send email verification (skip in development/mock)
      if (process.env.NODE_ENV === 'development') {
        // Skipping email verification sending
      } else {
        try {
          await this.sendEmailVerification(user.email, user.id);
        } catch (emailError) {
          console.warn('Email verification could not be sent:', emailError);
          // In production we might want to throw or log deeper
        }
      }

      // Generate tokens
      const token = AuthUtils.generateAccessToken(user.id, user.role);
      const refreshToken = AuthUtils.generateRefreshToken(user.id);

      // Store refresh token
      await this.db.cache(`refresh_token:${user.id}`, refreshToken, 7 * 24 * 60 * 60); // 7 days

      // Log registration event
      await this.logAuditEvent(user.id, 'USER_REGISTERED', 'user', user.id, {}, { email: user.email, role: user.role });

      await this.db.query('COMMIT');

      // Map to UserProfile
      const userProfile: UserProfile = {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: userData.firstName, // Use input data since not in DB
        lastName: userData.lastName,   // Use input data since not in DB
        emailVerified: user.email_verified,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      };

      return {
        user: userProfile,
        token,
        refreshToken
      };

    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error('Registration error:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Registration failed');
    }
  }

  /**
   * Login user with credentials
   */
  async login(credentials: LoginCredentials, ipAddress?: string, userAgent?: string): Promise<AuthResult> {
    try {
      // Check rate limiting first
      if (ipAddress) {
        const rateLimitResult = await this.securityService.checkLoginRateLimit(credentials.email, ipAddress);

        if (!rateLimitResult.allowed) {
          // Log rate limit exceeded event
          await this.securityService.logSecurityEvent({
            eventType: 'LOGIN_RATE_LIMIT_EXCEEDED',
            userEmail: credentials.email,
            ipAddress,
            userAgent,
            severity: 'HIGH',
            details: {
              remainingAttempts: rateLimitResult.remainingAttempts,
              lockoutTimeRemaining: rateLimitResult.lockoutTimeRemaining,
              resetTime: rateLimitResult.resetTime
            }
          });

          const lockoutMinutes = rateLimitResult.lockoutTimeRemaining ?
            Math.ceil(rateLimitResult.lockoutTimeRemaining / 60) : 15;

          throw new AppError(
            `Too many failed login attempts. Account temporarily locked for ${lockoutMinutes} minutes.`,
            429,
            'RATE_LIMIT_EXCEEDED',
            {
              lockoutTimeRemaining: rateLimitResult.lockoutTimeRemaining,
              resetTime: rateLimitResult.resetTime
            }
          );
        }
      }

      // Get user by email
      const user = await this.getUserByEmail(credentials.email);
      if (!user) {
        // Record failed attempt and log security event
        if (ipAddress) {
          await this.securityService.recordFailedLoginAttempt(credentials.email, ipAddress);
        }

        await this.securityService.logSecurityEvent({
          eventType: 'INVALID_LOGIN_ATTEMPT',
          userEmail: credentials.email,
          ipAddress,
          userAgent,
          severity: 'MEDIUM',
          details: { reason: 'User not found' }
        });

        throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }

      // Verify password
      const isValidPassword = await AuthUtils.verifyPassword(credentials.password, user.passwordHash);
      if (!isValidPassword) {
        // Record failed attempt and log security event
        if (ipAddress) {
          await this.securityService.recordFailedLoginAttempt(credentials.email, ipAddress);
        }

        await this.securityService.logSecurityEvent({
          eventType: 'INVALID_LOGIN_ATTEMPT',
          userEmail: credentials.email,
          userId: user.id,
          ipAddress,
          userAgent,
          severity: 'MEDIUM',
          details: { reason: 'Invalid password' }
        });

        throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }

      // Check if email is verified
      if (!user.emailVerified) {
        await this.securityService.logSecurityEvent({
          eventType: 'LOGIN_ATTEMPT_UNVERIFIED_EMAIL',
          userEmail: credentials.email,
          userId: user.id,
          ipAddress,
          userAgent,
          severity: 'LOW',
          details: { reason: 'Email not verified' }
        });

        throw new AppError('Please verify your email before logging in', 403, 'EMAIL_NOT_VERIFIED');
      }

      // Handle MFA if enabled
      if (user.mfaEnabled) {
        if (!credentials.mfaCode) {
          await this.securityService.logSecurityEvent({
            eventType: 'MFA_CODE_REQUIRED',
            userEmail: credentials.email,
            userId: user.id,
            ipAddress,
            userAgent,
            severity: 'LOW'
          });

          throw new AppError('MFA code required', 401, 'MFA_REQUIRED');
        }

        const isValidMFA = await this.mfaService.verifyMFACode(user.id, credentials.mfaCode);
        if (!isValidMFA) {
          // Record failed attempt and log security event
          if (ipAddress) {
            await this.securityService.recordFailedLoginAttempt(credentials.email, ipAddress);
          }

          await this.securityService.logSecurityEvent({
            eventType: 'INVALID_MFA_ATTEMPT',
            userEmail: credentials.email,
            userId: user.id,
            ipAddress,
            userAgent,
            severity: 'HIGH',
            details: { reason: 'Invalid MFA code' }
          });

          throw new AppError('Invalid MFA code', 401, 'INVALID_MFA_CODE');
        }
      }

      // Clear any existing failed login attempts
      if (ipAddress) {
        await this.securityService.clearLoginAttempts(credentials.email, ipAddress);
      }

      // Generate tokens
      const accessToken = AuthUtils.generateAccessToken(user.id, user.role);
      const refreshToken = AuthUtils.generateRefreshToken(user.id);

      // Store refresh token in Redis with expiration
      const refreshTokenKey = `refresh_token:${user.id}`;
      await this.db.cache(refreshTokenKey, refreshToken, 7 * 24 * 60 * 60); // 7 days

      // Update last login timestamp
      await this.updateLastLogin(user.id);

      // Log successful login
      await this.logAuditEvent(user.id, 'USER_LOGIN', 'user', user.id, null, {
        email: user.email,
        mfaUsed: user.mfaEnabled,
        ipAddress,
        userAgent
      });

      await this.securityService.logSecurityEvent({
        eventType: 'SUCCESSFUL_LOGIN',
        userEmail: credentials.email,
        userId: user.id,
        ipAddress,
        userAgent,
        severity: 'LOW',
        details: { mfaUsed: user.mfaEnabled }
      });

      return {
        accessToken,
        refreshToken,
        expiresIn: 3600, // 1 hour
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified,
          mfaEnabled: user.mfaEnabled,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt,
          passwordHash: user.passwordHash // This will be filtered out in the response
        }
      };

    } catch (error) {
      console.error('Login error:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Login failed', 500, 'LOGIN_FAILED');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      // Validate refresh token
      const validation = AuthUtils.validateRefreshToken(refreshToken);
      if (!validation.valid || !validation.userId) {
        throw new AppError('Invalid refresh token');
      }

      // Check if refresh token exists in Redis
      const refreshTokenKey = `refresh_token:${validation.userId}`;
      const storedToken = await this.db.getCached<string>(refreshTokenKey);

      if (!storedToken || storedToken !== refreshToken) {
        throw new AppError('Refresh token not found or expired');
      }

      // Get user
      const user = await this.getUserById(validation.userId);
      if (!user) {
        throw new AppError('User not found');
      }

      // Generate new tokens
      const newAccessToken = AuthUtils.generateAccessToken(user.id, user.role);
      const newRefreshToken = AuthUtils.generateRefreshToken(user.id);

      // Update refresh token in Redis
      await this.db.cache(refreshTokenKey, newRefreshToken, 7 * 24 * 60 * 60); // 7 days

      // Log token refresh
      await this.logAuditEvent(user.id, 'TOKEN_REFRESHED', 'user', user.id);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 3600, // 1 hour
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified,
          mfaEnabled: user.mfaEnabled,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt,
          passwordHash: user.passwordHash
        }
      };

    } catch (error) {
      console.error('Token refresh error:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Token refresh failed');
    }
  }

  /**
   * Logout user by invalidating refresh token
   */
  async logout(userId: string): Promise<void> {
    try {
      // Remove refresh token from Redis
      const refreshTokenKey = `refresh_token:${userId}`;
      await this.db.deleteCached(refreshTokenKey);

      // Log logout event
      await this.logAuditEvent(userId, 'USER_LOGOUT', 'user', userId);

    } catch (error) {
      console.error('Logout error:', error);
      throw new AppError('Logout failed');
    }
  }

  /**
   * Verify email with verification token
   */
  async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
    try {
      // Get verification data from Redis
      const verificationKey = `email_verification:${token}`;
      const userId = await this.db.getCached<string>(verificationKey);

      if (!userId) {
        throw new AppError('Invalid or expired verification token');
      }

      // Update user email verification status
      const query = `
        UPDATE users 
        SET email_verified = true, updated_at = NOW()
        WHERE id = $1
        RETURNING email
      `;

      const result = await this.db.query(query, [userId]);
      if (result.rows.length === 0) {
        throw new AppError('User not found');
      }

      // Remove verification token from Redis
      await this.db.deleteCached(verificationKey);

      // Log email verification
      await this.logAuditEvent(userId, 'EMAIL_VERIFIED', 'user', userId);

      return {
        success: true,
        message: 'Email verified successfully'
      };

    } catch (error) {
      console.error('Email verification error:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Email verification failed');
    }
  }

  /**
   * Send password reset email
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    try {
      const user = await this.getUserByEmail(email);
      if (!user) {
        // Don't reveal if email exists or not
        return {
          success: true,
          message: 'If the email exists, a password reset link has been sent'
        };
      }

      // Generate reset token
      const resetToken = uuidv4();
      const resetTokenKey = `password_reset:${resetToken}`;

      // Store reset token in Redis with 1 hour expiration
      await this.db.cache(resetTokenKey, user.id, 60 * 60);

      // Send password reset email
      await this.emailService.sendPasswordResetEmail(user.email, resetToken);

      // Log password reset request
      await this.logAuditEvent(user.id, 'PASSWORD_RESET_REQUESTED', 'user', user.id);

      return {
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      };

    } catch (error) {
      console.error('Password reset request error:', error);
      throw new AppError('Password reset request failed');
    }
  }

  /**
   * Get MFA service instance for external access
   */
  getMFAService(): MFAService {
    return this.mfaService;
  }

  /**
   * Get security service instance for external access
   */
  getSecurityService(): SecurityService {
    return this.securityService;
  }

  // Private helper methods

  private async getUserByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT id, email, password_hash, role, email_verified, mfa_enabled, mfa_secret, 
             created_at, updated_at, last_login_at
      FROM users 
      WHERE email = $1
    `;

    const result = await this.db.query(query, [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role as UserRole,
      emailVerified: row.email_verified,
      mfaEnabled: row.mfa_enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at
    };
  }

  public async getUserById(id: string): Promise<User | null> {
    const query = `
      SELECT id, email, password_hash, role, email_verified, mfa_enabled, mfa_secret,
             created_at, updated_at, last_login_at
      FROM users 
      WHERE id = $1
    `;

    const result = await this.db.query(query, [id]);
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role as UserRole,
      emailVerified: row.email_verified,
      mfaEnabled: row.mfa_enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at
    };
  }

  private async updateLastLogin(userId: string): Promise<void> {
    const query = `
      UPDATE users 
      SET last_login_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `;
    await this.db.query(query, [userId]);
  }

  private async sendEmailVerification(email: string, userId: string): Promise<void> {
    const verificationToken = uuidv4();
    const verificationKey = `email_verification:${verificationToken}`;

    // Store verification token in Redis with 24 hour expiration
    await this.db.cache(verificationKey, userId, 24 * 60 * 60);

    // Send verification email
    await this.emailService.sendVerificationEmail(email, verificationToken);
  }

  public async logAuditEvent(
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    oldValues?: any,
    newValues?: any
  ): Promise<void> {
    const query = `
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `;

    await this.db.query(query, [
      userId,
      action,
      resourceType,
      resourceId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null
    ]);
  }
}