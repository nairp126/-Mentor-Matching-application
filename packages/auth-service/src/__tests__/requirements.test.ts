/**
 * Requirements Validation Tests for Authentication Service
 * 
 * This test suite validates that the authentication service meets the specific
 * requirements outlined in task 2.1:
 * - Implement user registration with email verification
 * - Create login endpoint with JWT token generation  
 * - Add password hashing with bcrypt
 * - Requirements: 1.1, 1.2
 */

import { AuthUtils } from '@mentor-platform/shared';
import { AuthService } from '../services/authService';
import { EmailService } from '../services/emailService';
import { MFAService } from '../services/mfaService';
import { SecurityService } from '../services/securityService';

// Mock the database and email service for isolated testing
const mockDb = {
  query: jest.fn(),
  cache: jest.fn(),
  getCached: jest.fn(),
  deleteCached: jest.fn()
} as any;

const mockEmailService = {
  sendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn()
} as any;

const mockMFAService = {
  verifyMFACode: jest.fn(),
  setupMFA: jest.fn(),
  enableMFA: jest.fn(),
  disableMFA: jest.fn(),
  getMFAStatus: jest.fn(),
  regenerateBackupCodes: jest.fn()
} as any;

const mockSecurityService = {
  logSecurityEvent: jest.fn().mockImplementation((event: any) => {
    // Simulate the actual console.warn call that the real SecurityService makes
    console.warn(`Security Event [${event.severity}]: ${event.eventType}`, {
      userEmail: event.userEmail,
      userId: event.userId,
      ipAddress: event.ipAddress,
      details: event.details,
      timestamp: new Date().toISOString()
    });
  }),
  checkLoginRateLimit: jest.fn(),
  recordFailedLoginAttempt: jest.fn(),
  clearLoginAttempts: jest.fn()
} as any;

describe('Authentication Service Requirements Validation', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(mockDb);
    (authService as any).emailService = mockEmailService;
    (authService as any).mfaService = mockMFAService;
    (authService as any).securityService = mockSecurityService;
  });

  describe('Requirement 1.1: User Registration with Email Verification', () => {
    it('should create a new account when user registers with valid credentials', async () => {
      // Arrange
      const validRegistration = {
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
        firstName: 'John',
        lastName: 'Doe',
        role: 'STUDENT' as const
      };

      // Mock: User doesn't exist
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // getUserByEmail returns empty
        .mockResolvedValueOnce({ // INSERT user returns new user
          rows: [{
            id: 'new-user-123',
            email: 'newuser@example.com',
            role: 'STUDENT',
            email_verified: false,
            created_at: new Date()
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // audit log

      mockEmailService.sendVerificationEmail.mockResolvedValue(undefined);

      // Act
      const result = await authService.register(validRegistration);

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toContain('registered successfully');
      expect(result.userId).toBe('new-user-123');
      
      // Verify password was hashed (not stored in plain text)
      const insertCall = mockDb.query.mock.calls.find((call: any) => 
        call[0].includes('INSERT INTO users')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall[1][2]).not.toBe(validRegistration.password); // password_hash != plain password
      
      // Verify email verification was sent
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
        validRegistration.email,
        expect.any(String)
      );
    });

    it('should send email verification when user registers', async () => {
      // Arrange
      const registration = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
        role: 'MENTOR' as const
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 'user-123', email: 'test@example.com' }]
        })
        .mockResolvedValueOnce({ rows: [] });

      mockEmailService.sendVerificationEmail.mockResolvedValue(undefined);

      // Act
      await authService.register(registration);

      // Assert - Email verification should be sent
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
        registration.email,
        expect.any(String) // verification token
      );

      // Verify verification token is cached in Redis
      expect(mockDb.cache).toHaveBeenCalledWith(
        expect.stringMatching(/^email_verification:/),
        expect.any(String), // userId
        24 * 60 * 60 // 24 hours
      );
    });

    it('should reject registration when user already exists', async () => {
      // Arrange
      const existingUserRegistration = {
        email: 'existing@example.com',
        password: 'Password123!',
        firstName: 'Existing',
        lastName: 'User',
        role: 'STUDENT' as const
      };

      // Mock: User already exists
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'existing-user',
          email: 'existing@example.com',
          password_hash: 'existing-hash',
          role: 'STUDENT',
          email_verified: true,
          mfa_enabled: false,
          created_at: new Date(),
          updated_at: new Date()
        }]
      });

      // Act & Assert
      await expect(authService.register(existingUserRegistration))
        .rejects.toThrow('User with this email already exists');

      // Verify no email was sent for duplicate registration
      expect(mockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('Requirement 1.2: Login with JWT Token Generation', () => {
    it('should authenticate user and establish secure session with valid credentials', async () => {
      // Arrange
      const loginCredentials = {
        email: 'verified@example.com',
        password: 'CorrectPassword123!'
      };

      const mockUser = {
        id: 'verified-user-123',
        email: 'verified@example.com',
        passwordHash: 'hashed-password',
        role: 'STUDENT' as const,
        emailVerified: true,
        mfaEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null
      };

      // Mock database responses
      mockDb.query
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

      // Mock AuthUtils
      jest.spyOn(AuthUtils, 'verifyPassword').mockResolvedValue(true);
      // Use real JWT generation for proper token structure
      const realAccessToken = AuthUtils.generateAccessToken(mockUser.id, mockUser.role);
      const realRefreshToken = AuthUtils.generateRefreshToken(mockUser.id);
      jest.spyOn(AuthUtils, 'generateAccessToken').mockReturnValue(realAccessToken);
      jest.spyOn(AuthUtils, 'generateRefreshToken').mockReturnValue(realRefreshToken);

      // Act
      const result = await authService.login(loginCredentials);

      // Assert - Should return JWT tokens and user info
      expect(result.accessToken).toBe(realAccessToken);
      expect(result.refreshToken).toBe(realRefreshToken);
      expect(result.expiresIn).toBe(3600); // 1 hour
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.email).toBe(mockUser.email);

      // Verify JWT tokens were generated with correct parameters
      expect(AuthUtils.generateAccessToken).toHaveBeenCalledWith(mockUser.id, mockUser.role);
      expect(AuthUtils.generateRefreshToken).toHaveBeenCalledWith(mockUser.id);

      // Verify refresh token is stored securely in Redis
      expect(mockDb.cache).toHaveBeenCalledWith(
        `refresh_token:${mockUser.id}`,
        realRefreshToken,
        7 * 24 * 60 * 60 // 7 days
      );

      // Verify last login timestamp is updated
      const updateLoginCall = mockDb.query.mock.calls.find((call: any) =>
        call[0].includes('UPDATE users') && call[0].includes('last_login_at')
      );
      expect(updateLoginCall).toBeDefined();
    });

    it('should reject login attempt with invalid credentials and log security event', async () => {
      // Arrange
      const invalidCredentials = {
        email: 'user@example.com',
        password: 'WrongPassword'
      };

      // Mock: User exists but password is wrong
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'user-123',
          email: 'user@example.com',
          password_hash: 'correct-hash',
          role: 'STUDENT',
          email_verified: true,
          mfa_enabled: false,
          created_at: new Date(),
          updated_at: new Date(),
          last_login_at: null
        }]
      });

      jest.spyOn(AuthUtils, 'verifyPassword').mockResolvedValue(false);

      // Spy on console.warn to verify security logging
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Act & Assert
      await expect(authService.login(invalidCredentials))
        .rejects.toThrow('Invalid credentials');

      // Verify security event was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        'Security Event [MEDIUM]: INVALID_LOGIN_ATTEMPT',
        expect.objectContaining({
          userEmail: invalidCredentials.email,
          details: { reason: 'Invalid password' }
        })
      );

      // Verify no tokens were generated
      expect(AuthUtils.generateAccessToken).not.toHaveBeenCalled();
      expect(AuthUtils.generateRefreshToken).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should require email verification before allowing login', async () => {
      // Arrange
      const unverifiedUserCredentials = {
        email: 'unverified@example.com',
        password: 'CorrectPassword123!'
      };

      // Mock: User exists but email is not verified
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'unverified-user',
          email: 'unverified@example.com',
          password_hash: 'correct-hash',
          role: 'STUDENT',
          email_verified: false, // Not verified
          mfa_enabled: false,
          created_at: new Date(),
          updated_at: new Date(),
          last_login_at: null
        }]
      });

      jest.spyOn(AuthUtils, 'verifyPassword').mockResolvedValue(true);

      // Act & Assert
      await expect(authService.login(unverifiedUserCredentials))
        .rejects.toThrow('Please verify your email before logging in');

      // Verify no tokens were generated for unverified user
      expect(AuthUtils.generateAccessToken).not.toHaveBeenCalled();
      expect(AuthUtils.generateRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('Password Hashing with bcrypt (Security Requirement)', () => {
    it('should hash passwords using bcrypt with proper salt rounds', async () => {
      // Ensure we're using the real AuthUtils implementation, not mocks
      jest.restoreAllMocks();
      
      // Test the actual AuthUtils.hashPassword implementation
      const password = 'TestPassword123!';
      const hash = await AuthUtils.hashPassword(password);

      // Verify bcrypt format and security
      expect(hash).toMatch(/^\$2b\$/); // bcrypt identifier
      expect(hash.length).toBeGreaterThanOrEqual(60); // bcrypt hash length
      expect(hash).not.toBe(password); // Not plain text

      // Verify password can be verified
      const isValid = await AuthUtils.verifyPassword(password, hash);
      expect(isValid).toBe(true);

      // Verify wrong password fails
      const isInvalid = await AuthUtils.verifyPassword('WrongPassword', hash);
      expect(isInvalid).toBe(false);
    });

    it('should generate different hashes for the same password (salt)', async () => {
      const password = 'SamePassword123!';
      
      const hash1 = await AuthUtils.hashPassword(password);
      const hash2 = await AuthUtils.hashPassword(password);

      // Different hashes due to salt
      expect(hash1).not.toBe(hash2);
      
      // Both should verify correctly
      expect(await AuthUtils.verifyPassword(password, hash1)).toBe(true);
      expect(await AuthUtils.verifyPassword(password, hash2)).toBe(true);
    });
  });

  describe('JWT Token Security and Structure', () => {
    it('should generate JWT tokens with proper structure and claims', () => {
      // Ensure we're using the real AuthUtils implementation, not mocks
      jest.restoreAllMocks();
      
      const userId = 'test-user-123';
      const role = 'MENTOR';

      const accessToken = AuthUtils.generateAccessToken(userId, role);
      const refreshToken = AuthUtils.generateRefreshToken(userId);

      // Verify JWT structure (3 parts separated by dots)
      expect(accessToken.split('.')).toHaveLength(3);
      expect(refreshToken.split('.')).toHaveLength(3);

      // Verify access token validation
      const validation = AuthUtils.validateToken(accessToken);
      expect(validation.valid).toBe(true);
      expect(validation.userId).toBe(userId);
      expect(validation.role).toBe(role);
      expect(validation.expiresAt).toBeInstanceOf(Date);

      // Verify refresh token validation
      const refreshValidation = AuthUtils.validateRefreshToken(refreshToken);
      expect(refreshValidation.valid).toBe(true);
      expect(refreshValidation.userId).toBe(userId);
    });

    it('should not accept refresh tokens as access tokens', () => {
      const userId = 'test-user-123';
      const refreshToken = AuthUtils.generateRefreshToken(userId);

      // Refresh token should not validate as access token
      const validation = AuthUtils.validateToken(refreshToken);
      expect(validation.valid).toBe(false);
    });
  });

  describe('Multi-Factor Authentication Support', () => {
    it('should require MFA code when MFA is enabled', async () => {
      // Arrange
      const mfaUserCredentials = {
        email: 'mfa@example.com',
        password: 'CorrectPassword123!'
        // Missing mfaCode
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'mfa-user',
          email: 'mfa@example.com',
          password_hash: 'correct-hash',
          role: 'MENTOR',
          email_verified: true,
          mfa_enabled: true, // MFA enabled
          created_at: new Date(),
          updated_at: new Date(),
          last_login_at: null
        }]
      });

      jest.spyOn(AuthUtils, 'verifyPassword').mockResolvedValue(true);

      // Act & Assert
      await expect(authService.login(mfaUserCredentials))
        .rejects.toThrow('MFA code required');
    });

    it('should authenticate successfully with valid MFA code', async () => {
      // Arrange
      const mfaCredentials = {
        email: 'mfa@example.com',
        password: 'CorrectPassword123!',
        mfaCode: '123456'
      };

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'mfa-user',
            email: 'mfa@example.com',
            password_hash: 'correct-hash',
            role: 'MENTOR',
            email_verified: true,
            mfa_enabled: true,
            created_at: new Date(),
            updated_at: new Date(),
            last_login_at: null
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // updateLastLogin
        .mockResolvedValueOnce({ rows: [] }); // audit log

      jest.spyOn(AuthUtils, 'verifyPassword').mockResolvedValue(true);
      jest.spyOn(AuthUtils, 'generateAccessToken').mockReturnValue('mfa-access-token');
      jest.spyOn(AuthUtils, 'generateRefreshToken').mockReturnValue('mfa-refresh-token');
      mockMFAService.verifyMFACode.mockResolvedValue(true);

      // Act
      const result = await authService.login(mfaCredentials);

      // Assert
      expect(result.accessToken).toBe('mfa-access-token');
      expect(result.refreshToken).toBe('mfa-refresh-token');
      expect(result.user.id).toBe('mfa-user');
    });
  });
});