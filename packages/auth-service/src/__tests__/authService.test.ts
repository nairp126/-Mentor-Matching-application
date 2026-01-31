import { AuthService } from '../services/authService';
import { DatabaseManager, AuthUtils } from '@mentor-platform/shared';
import { EmailService } from '../services/emailService';
import { SecurityService } from '../services/securityService';
import { MFAService } from '../services/mfaService';

// Mock dependencies
jest.mock('@mentor-platform/shared');
jest.mock('../services/emailService');
jest.mock('../services/securityService');
jest.mock('../services/mfaService');

const mockDb = {
  query: jest.fn(),
  cache: jest.fn(),
  getCached: jest.fn(),
  deleteCached: jest.fn()
} as unknown as DatabaseManager;

const mockEmailService = {
  sendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn()
} as unknown as EmailService;

const mockSecurityService = {
  logSecurityEvent: jest.fn(),
  checkLoginRateLimit: jest.fn(),
  recordFailedLoginAttempt: jest.fn(),
  clearLoginAttempts: jest.fn(),
  getSecurityEventStats: jest.fn(),
  extractSecurityContext: jest.fn()
} as unknown as SecurityService;

const mockMFAService = {
  verifyMFACode: jest.fn(),
  setupMFA: jest.fn(),
  enableMFA: jest.fn(),
  disableMFA: jest.fn(),
  getMFAStatus: jest.fn(),
  regenerateBackupCodes: jest.fn()
} as unknown as MFAService;

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(mockDb);
    // Replace the services with our mocks
    (authService as any).emailService = mockEmailService;
    (authService as any).securityService = mockSecurityService;
    (authService as any).mfaService = mockMFAService;
  });

  describe('register', () => {
    const validRegistrationData = {
      email: 'test@example.com',
      password: 'TestPassword123!',
      firstName: 'John',
      lastName: 'Doe',
      role: 'STUDENT' as const
    };

    it('should successfully register a new user', async () => {
      // Mock user doesn't exist
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // getUserByEmail returns empty
        .mockResolvedValueOnce({ // INSERT user returns new user
          rows: [{
            id: 'user-123',
            email: 'test@example.com',
            role: 'STUDENT',
            email_verified: false,
            created_at: new Date()
          }]
        });

      (AuthUtils.hashPassword as jest.Mock).mockResolvedValue('hashed-password');
      (mockEmailService.sendVerificationEmail as jest.Mock).mockResolvedValue(undefined);

      const result = await authService.register(validRegistrationData);

      expect(result.success).toBe(true);
      expect(result.message).toContain('registered successfully');
      expect(result.userId).toBe('user-123');
      expect(AuthUtils.hashPassword).toHaveBeenCalledWith('TestPassword123!');
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalled();
    });

    it('should throw error if user already exists', async () => {
      // Mock user exists
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          id: 'existing-user',
          email: 'test@example.com',
          password_hash: 'hash',
          role: 'STUDENT',
          email_verified: true,
          mfa_enabled: false,
          created_at: new Date(),
          updated_at: new Date()
        }]
      });

      await expect(authService.register(validRegistrationData))
        .rejects.toThrow('User with this email already exists');
    });

    it('should handle registration errors gracefully', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // getUserByEmail returns empty
        .mockRejectedValueOnce(new Error('Database error'));

      (AuthUtils.hashPassword as jest.Mock).mockResolvedValue('hashed-password');

      await expect(authService.register(validRegistrationData))
        .rejects.toThrow('Registration failed');
    });
  });

  describe('login', () => {
    const validLoginCredentials = {
      email: 'test@example.com',
      password: 'TestPassword123!'
    };

    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      role: 'STUDENT' as const,
      emailVerified: true,
      mfaEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null
    };

    const ipAddress = '192.168.1.1';
    const userAgent = 'Mozilla/5.0';

    beforeEach(() => {
      // Default mock for rate limiting - allow login
      (mockSecurityService.checkLoginRateLimit as jest.Mock).mockResolvedValue({
        allowed: true,
        remainingAttempts: 5
      });
    });

    it('should successfully login with valid credentials', async () => {
      // Mock getUserByEmail
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{
            id: mockUser.id,
            email: mockUser.email,
            password_hash: mockUser.passwordHash,
            role: mockUser.role,
            email_verified: mockUser.emailVerified,
            mfa_enabled: mockUser.mfaEnabled,
            created_at: mockUser.createdAt,
            updated_at: mockUser.updatedAt,
            last_login_at: mockUser.lastLoginAt
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // updateLastLogin
        .mockResolvedValueOnce({ rows: [] }); // audit log

      (AuthUtils.verifyPassword as jest.Mock).mockResolvedValue(true);
      (AuthUtils.generateAccessToken as jest.Mock).mockReturnValue('access-token');
      (AuthUtils.generateRefreshToken as jest.Mock).mockReturnValue('refresh-token');

      const result = await authService.login(validLoginCredentials, ipAddress, userAgent);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.expiresIn).toBe(3600);
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.email).toBe(mockUser.email);
      
      // Verify security service calls
      expect(mockSecurityService.checkLoginRateLimit).toHaveBeenCalledWith('test@example.com', ipAddress);
      expect(mockSecurityService.clearLoginAttempts).toHaveBeenCalledWith('test@example.com', ipAddress);
      expect(mockSecurityService.logSecurityEvent).toHaveBeenCalledWith({
        eventType: 'SUCCESSFUL_LOGIN',
        userEmail: 'test@example.com',
        userId: mockUser.id,
        ipAddress,
        userAgent,
        severity: 'LOW',
        details: { mfaUsed: false }
      });
    });

    it('should deny login when rate limited', async () => {
      (mockSecurityService.checkLoginRateLimit as jest.Mock).mockResolvedValue({
        allowed: false,
        remainingAttempts: 0,
        lockoutTimeRemaining: 900, // 15 minutes
        resetTime: new Date(Date.now() + 900000)
      });

      await expect(authService.login(validLoginCredentials, ipAddress, userAgent))
        .rejects.toThrow('Too many failed login attempts');

      expect(mockSecurityService.logSecurityEvent).toHaveBeenCalledWith({
        eventType: 'LOGIN_RATE_LIMIT_EXCEEDED',
        userEmail: 'test@example.com',
        ipAddress,
        userAgent,
        severity: 'HIGH',
        details: expect.objectContaining({
          remainingAttempts: 0,
          lockoutTimeRemaining: 900
        })
      });
    });

    it('should throw error and log security event for invalid email', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(authService.login(validLoginCredentials, ipAddress, userAgent))
        .rejects.toThrow('Invalid credentials');

      expect(mockSecurityService.recordFailedLoginAttempt).toHaveBeenCalledWith('test@example.com', ipAddress);
      expect(mockSecurityService.logSecurityEvent).toHaveBeenCalledWith({
        eventType: 'INVALID_LOGIN_ATTEMPT',
        userEmail: 'test@example.com',
        ipAddress,
        userAgent,
        severity: 'MEDIUM',
        details: { reason: 'User not found' }
      });
    });

    it('should throw error and log security event for invalid password', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          id: mockUser.id,
          email: mockUser.email,
          password_hash: mockUser.passwordHash,
          role: mockUser.role,
          email_verified: mockUser.emailVerified,
          mfa_enabled: mockUser.mfaEnabled,
          created_at: mockUser.createdAt,
          updated_at: mockUser.updatedAt,
          last_login_at: mockUser.lastLoginAt
        }]
      });

      (AuthUtils.verifyPassword as jest.Mock).mockResolvedValue(false);

      await expect(authService.login(validLoginCredentials, ipAddress, userAgent))
        .rejects.toThrow('Invalid credentials');

      expect(mockSecurityService.recordFailedLoginAttempt).toHaveBeenCalledWith('test@example.com', ipAddress);
      expect(mockSecurityService.logSecurityEvent).toHaveBeenCalledWith({
        eventType: 'INVALID_LOGIN_ATTEMPT',
        userEmail: 'test@example.com',
        userId: mockUser.id,
        ipAddress,
        userAgent,
        severity: 'MEDIUM',
        details: { reason: 'Invalid password' }
      });
    });

    it('should throw error and log security event for unverified email', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          ...mockUser,
          email_verified: false
        }]
      });

      (AuthUtils.verifyPassword as jest.Mock).mockResolvedValue(true);

      await expect(authService.login(validLoginCredentials, ipAddress, userAgent))
        .rejects.toThrow('Please verify your email before logging in');

      expect(mockSecurityService.logSecurityEvent).toHaveBeenCalledWith({
        eventType: 'LOGIN_ATTEMPT_UNVERIFIED_EMAIL',
        userEmail: 'test@example.com',
        userId: mockUser.id,
        ipAddress,
        userAgent,
        severity: 'LOW',
        details: { reason: 'Email not verified' }
      });
    });

    it('should handle MFA when enabled and code provided', async () => {
      const credentialsWithMFA = {
        ...validLoginCredentials,
        mfaCode: '123456'
      };

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{
            id: mockUser.id,
            email: mockUser.email,
            password_hash: mockUser.passwordHash,
            role: mockUser.role,
            email_verified: true, // Make sure email is verified
            mfa_enabled: true,
            created_at: mockUser.createdAt,
            updated_at: mockUser.updatedAt,
            last_login_at: mockUser.lastLoginAt
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // updateLastLogin
        .mockResolvedValueOnce({ rows: [] }); // audit log

      (AuthUtils.verifyPassword as jest.Mock).mockResolvedValue(true);
      (AuthUtils.generateAccessToken as jest.Mock).mockReturnValue('access-token');
      (AuthUtils.generateRefreshToken as jest.Mock).mockReturnValue('refresh-token');
      (mockMFAService.verifyMFACode as jest.Mock).mockResolvedValue(true);

      const result = await authService.login(credentialsWithMFA, ipAddress, userAgent);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(mockSecurityService.logSecurityEvent).toHaveBeenCalledWith({
        eventType: 'SUCCESSFUL_LOGIN',
        userEmail: 'test@example.com',
        userId: mockUser.id,
        ipAddress,
        userAgent,
        severity: 'LOW',
        details: { mfaUsed: true }
      });
    });

    it('should throw error when MFA is enabled but code not provided', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          id: mockUser.id,
          email: mockUser.email,
          password_hash: mockUser.passwordHash,
          role: mockUser.role,
          email_verified: true, // Make sure email is verified
          mfa_enabled: true,
          created_at: mockUser.createdAt,
          updated_at: mockUser.updatedAt,
          last_login_at: mockUser.lastLoginAt
        }]
      });

      (AuthUtils.verifyPassword as jest.Mock).mockResolvedValue(true);

      await expect(authService.login(validLoginCredentials, ipAddress, userAgent))
        .rejects.toThrow('MFA code required');

      expect(mockSecurityService.logSecurityEvent).toHaveBeenCalledWith({
        eventType: 'MFA_CODE_REQUIRED',
        userEmail: 'test@example.com',
        userId: mockUser.id,
        ipAddress,
        userAgent,
        severity: 'LOW'
      });
    });

    it('should throw error and log security event for invalid MFA code', async () => {
      const credentialsWithMFA = {
        ...validLoginCredentials,
        mfaCode: '00000' // 5 digits - should fail validation
      };

      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          id: mockUser.id,
          email: mockUser.email,
          password_hash: mockUser.passwordHash,
          role: mockUser.role,
          email_verified: true, // Make sure email is verified
          mfa_enabled: true,
          created_at: mockUser.createdAt,
          updated_at: mockUser.updatedAt,
          last_login_at: mockUser.lastLoginAt
        }]
      });

      (AuthUtils.verifyPassword as jest.Mock).mockResolvedValue(true);
      // Mock MFA verification to fail for invalid code
      (mockMFAService.verifyMFACode as jest.Mock).mockResolvedValue(false);

      await expect(authService.login(credentialsWithMFA, ipAddress, userAgent))
        .rejects.toThrow('Invalid MFA code');

      expect(mockSecurityService.recordFailedLoginAttempt).toHaveBeenCalledWith('test@example.com', ipAddress);
      expect(mockSecurityService.logSecurityEvent).toHaveBeenCalledWith({
        eventType: 'INVALID_MFA_ATTEMPT',
        userEmail: 'test@example.com',
        userId: mockUser.id,
        ipAddress,
        userAgent,
        severity: 'HIGH',
        details: { reason: 'Invalid MFA code' }
      });
    });

    it('should work without IP address and user agent', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{
            id: mockUser.id,
            email: mockUser.email,
            password_hash: mockUser.passwordHash,
            role: mockUser.role,
            email_verified: mockUser.emailVerified,
            mfa_enabled: mockUser.mfaEnabled,
            created_at: mockUser.createdAt,
            updated_at: mockUser.updatedAt,
            last_login_at: mockUser.lastLoginAt
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // updateLastLogin
        .mockResolvedValueOnce({ rows: [] }); // audit log

      (AuthUtils.verifyPassword as jest.Mock).mockResolvedValue(true);
      (AuthUtils.generateAccessToken as jest.Mock).mockReturnValue('access-token');
      (AuthUtils.generateRefreshToken as jest.Mock).mockReturnValue('refresh-token');

      const result = await authService.login(validLoginCredentials);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      
      // Should not call rate limiting when no IP address provided
      expect(mockSecurityService.checkLoginRateLimit).not.toHaveBeenCalled();
      expect(mockSecurityService.clearLoginAttempts).not.toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    const mockRefreshToken = 'valid-refresh-token';
    const mockUserId = 'user-123';

    it('should successfully refresh token', async () => {
      (AuthUtils.validateRefreshToken as jest.Mock).mockReturnValue({
        valid: true,
        userId: mockUserId
      });

      (mockDb.getCached as jest.Mock).mockResolvedValue(mockRefreshToken);

      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          id: mockUserId,
          email: 'test@example.com',
          password_hash: 'hash',
          role: 'STUDENT',
          email_verified: true,
          mfa_enabled: false,
          created_at: new Date(),
          updated_at: new Date(),
          last_login_at: new Date()
        }]
      });

      (AuthUtils.generateAccessToken as jest.Mock).mockReturnValue('new-access-token');
      (AuthUtils.generateRefreshToken as jest.Mock).mockReturnValue('new-refresh-token');

      const result = await authService.refreshToken(mockRefreshToken);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.expiresIn).toBe(3600);
    });

    it('should throw error for invalid refresh token', async () => {
      (AuthUtils.validateRefreshToken as jest.Mock).mockReturnValue({
        valid: false
      });

      await expect(authService.refreshToken('invalid-token'))
        .rejects.toThrow('Invalid refresh token');
    });

    it('should throw error when refresh token not found in Redis', async () => {
      (AuthUtils.validateRefreshToken as jest.Mock).mockReturnValue({
        valid: true,
        userId: mockUserId
      });

      (mockDb.getCached as jest.Mock).mockResolvedValue(null);

      await expect(authService.refreshToken(mockRefreshToken))
        .rejects.toThrow('Refresh token not found or expired');
    });
  });

  describe('logout', () => {
    it('should successfully logout user', async () => {
      const userId = 'user-123';
      (mockDb.deleteCached as jest.Mock).mockResolvedValue(undefined);
      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [] }); // audit log

      await authService.logout(userId);

      expect(mockDb.deleteCached).toHaveBeenCalledWith(`refresh_token:${userId}`);
    });
  });

  describe('verifyEmail', () => {
    it('should successfully verify email', async () => {
      const token = 'verification-token';
      const userId = 'user-123';

      (mockDb.getCached as jest.Mock).mockResolvedValue(userId);
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{ email: 'test@example.com' }] // UPDATE query returns the email
        })
        .mockResolvedValueOnce({ rows: [] }); // audit log

      (mockDb.deleteCached as jest.Mock).mockResolvedValue(undefined);

      const result = await authService.verifyEmail(token);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Email verified successfully');
      expect(mockDb.deleteCached).toHaveBeenCalledWith(`email_verification:${token}`);
    });

    it('should throw error for invalid verification token', async () => {
      (mockDb.getCached as jest.Mock).mockResolvedValue(null);

      await expect(authService.verifyEmail('invalid-token'))
        .rejects.toThrow('Invalid or expired verification token');
    });
  });

  describe('requestPasswordReset', () => {
    it('should send password reset email for existing user', async () => {
      const email = 'test@example.com';
      const mockUser = {
        id: 'user-123',
        email,
        passwordHash: 'hash',
        role: 'STUDENT' as const,
        emailVerified: true,
        mfaEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null
      };

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{
            id: mockUser.id,
            email: mockUser.email,
            password_hash: mockUser.passwordHash,
            role: mockUser.role,
            email_verified: mockUser.emailVerified,
            mfa_enabled: mockUser.mfaEnabled,
            created_at: mockUser.createdAt,
            updated_at: mockUser.updatedAt,
            last_login_at: mockUser.lastLoginAt
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // audit log

      (mockEmailService.sendPasswordResetEmail as jest.Mock).mockResolvedValue(undefined);

      const result = await authService.requestPasswordReset(email);

      expect(result.success).toBe(true);
      expect(result.message).toContain('password reset link has been sent');
      expect(mockDb.cache).toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('should return success message even for non-existing user', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await authService.requestPasswordReset('nonexistent@example.com');

      expect(result.success).toBe(true);
      expect(result.message).toContain('password reset link has been sent');
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });
});