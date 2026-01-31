import { AuthService } from '../services/authService';
import { SecurityService } from '../services/securityService';
import { DatabaseManager } from '@mentor-platform/shared';

// This is an integration test to verify the enhanced authentication features
describe('Enhanced Authentication Integration', () => {
  let authService: AuthService;
  let securityService: SecurityService;
  let mockDb: jest.Mocked<DatabaseManager>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
      cache: jest.fn(),
      getCached: jest.fn(),
      deleteCached: jest.fn()
    } as any;

    authService = new AuthService(mockDb);
    securityService = authService.getSecurityService();
  });

  describe('Invalid Authentication Handling', () => {
    it('should reject login with invalid credentials and log security event', async () => {
      // Mock user not found
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const credentials = {
        email: 'nonexistent@example.com',
        password: 'wrongpassword'
      };

      const ipAddress = '192.168.1.100';
      const userAgent = 'Test-Agent/1.0';

      // Mock rate limiting to allow attempt
      jest.spyOn(securityService, 'checkLoginRateLimit').mockResolvedValue({
        allowed: true,
        remainingAttempts: 5
      });

      const logSecurityEventSpy = jest.spyOn(securityService, 'logSecurityEvent').mockResolvedValue();
      const recordFailedAttemptSpy = jest.spyOn(securityService, 'recordFailedLoginAttempt').mockResolvedValue();

      await expect(authService.login(credentials, ipAddress, userAgent))
        .rejects.toThrow('Invalid credentials');

      // Verify security logging
      expect(logSecurityEventSpy).toHaveBeenCalledWith({
        eventType: 'INVALID_LOGIN_ATTEMPT',
        userEmail: 'nonexistent@example.com',
        ipAddress,
        userAgent,
        severity: 'MEDIUM',
        details: { reason: 'User not found' }
      });

      // Verify failed attempt recording
      expect(recordFailedAttemptSpy).toHaveBeenCalledWith('nonexistent@example.com', ipAddress);
    });

    it('should enforce rate limiting after multiple failed attempts', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const ipAddress = '192.168.1.100';
      const userAgent = 'Test-Agent/1.0';

      // Mock rate limiting to deny attempt
      jest.spyOn(securityService, 'checkLoginRateLimit').mockResolvedValue({
        allowed: false,
        remainingAttempts: 0,
        lockoutTimeRemaining: 900, // 15 minutes
        resetTime: new Date(Date.now() + 900000)
      });

      const logSecurityEventSpy = jest.spyOn(securityService, 'logSecurityEvent').mockResolvedValue();

      await expect(authService.login(credentials, ipAddress, userAgent))
        .rejects.toThrow('Too many failed login attempts');

      // Verify rate limit exceeded logging
      expect(logSecurityEventSpy).toHaveBeenCalledWith({
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

    it('should clear failed attempts after successful login', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'correctpassword'
      };

      const ipAddress = '192.168.1.100';
      const userAgent = 'Test-Agent/1.0';

      // Mock successful login flow
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'user-123',
            email: 'test@example.com',
            password_hash: 'hashed-password',
            role: 'STUDENT',
            email_verified: true,
            mfa_enabled: false,
            created_at: new Date(),
            updated_at: new Date(),
            last_login_at: null
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // updateLastLogin
        .mockResolvedValueOnce({ rows: [] }); // audit log

      // Mock rate limiting to allow attempt
      jest.spyOn(securityService, 'checkLoginRateLimit').mockResolvedValue({
        allowed: true,
        remainingAttempts: 3
      });

      const clearAttemptsSpy = jest.spyOn(securityService, 'clearLoginAttempts').mockResolvedValue();
      const logSecurityEventSpy = jest.spyOn(securityService, 'logSecurityEvent').mockResolvedValue();

      // Mock AuthUtils
      const AuthUtils = require('@mentor-platform/shared').AuthUtils;
      AuthUtils.verifyPassword = jest.fn().mockResolvedValue(true);
      AuthUtils.generateAccessToken = jest.fn().mockReturnValue('access-token');
      AuthUtils.generateRefreshToken = jest.fn().mockReturnValue('refresh-token');

      const result = await authService.login(credentials, ipAddress, userAgent);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');

      // Verify failed attempts are cleared
      expect(clearAttemptsSpy).toHaveBeenCalledWith('test@example.com', ipAddress);

      // Verify successful login is logged
      expect(logSecurityEventSpy).toHaveBeenCalledWith({
        eventType: 'SUCCESSFUL_LOGIN',
        userEmail: 'test@example.com',
        userId: 'user-123',
        ipAddress,
        userAgent,
        severity: 'LOW',
        details: { mfaUsed: false }
      });
    });
  });

  describe('Security Event Logging', () => {
    it('should log security events with proper context', async () => {
      const event = {
        eventType: 'TEST_SECURITY_EVENT',
        userEmail: 'test@example.com',
        userId: 'user-123',
        ipAddress: '192.168.1.100',
        userAgent: 'Test-Agent/1.0',
        severity: 'HIGH' as const,
        details: { testData: 'test value' }
      };

      mockDb.query.mockResolvedValue({ rows: [] });

      await securityService.logSecurityEvent(event);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO security_events'),
        [
          'TEST_SECURITY_EVENT',
          'test@example.com',
          'user-123',
          '192.168.1.100',
          'Test-Agent/1.0',
          JSON.stringify({ testData: 'test value' }),
          'HIGH'
        ]
      );
    });
  });

  describe('Rate Limiting', () => {
    it('should track login attempts per email and IP', async () => {
      const email = 'test@example.com';
      const ipAddress = '192.168.1.100';

      mockDb.query.mockResolvedValue({ rows: [] });

      await securityService.recordFailedLoginAttempt(email, ipAddress);

      // Should record attempts for both email and IP
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO login_attempts'),
        ['test@example.com', 'EMAIL']
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO login_attempts'),
        ['192.168.1.100', 'IP']
      );
    });

    it('should extract security context from request', () => {
      const mockRequest = {
        headers: {
          'x-forwarded-for': '192.168.1.100, 10.0.0.1',
          'user-agent': 'Mozilla/5.0 (Test Browser)'
        },
        connection: {},
        socket: {}
      } as any;

      const context = securityService.extractSecurityContext(mockRequest);

      expect(context.ipAddress).toBe('192.168.1.100');
      expect(context.userAgent).toBe('Mozilla/5.0 (Test Browser)');
    });
  });
});