import { SecurityService } from '../services/securityService';
import { DatabaseManager } from '@mentor-platform/shared';
import { Request } from 'express';

// Mock dependencies
jest.mock('@mentor-platform/shared');

const mockDb = {
  query: jest.fn(),
  cache: jest.fn(),
  getCached: jest.fn(),
  deleteCached: jest.fn()
} as unknown as DatabaseManager;

describe('SecurityService', () => {
  let securityService: SecurityService;

  beforeEach(() => {
    jest.clearAllMocks();
    securityService = new SecurityService(mockDb);
  });

  describe('logSecurityEvent', () => {
    it('should log security event to database', async () => {
      const event = {
        eventType: 'INVALID_LOGIN_ATTEMPT',
        userEmail: 'test@example.com',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        severity: 'MEDIUM' as const,
        details: { reason: 'Invalid password' }
      };

      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [] });

      await securityService.logSecurityEvent(event);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO security_events'),
        [
          'INVALID_LOGIN_ATTEMPT',
          'test@example.com',
          null,
          '192.168.1.1',
          'Mozilla/5.0',
          JSON.stringify({ reason: 'Invalid password' }),
          'MEDIUM'
        ]
      );
    });

    it('should handle database errors gracefully', async () => {
      const event = {
        eventType: 'TEST_EVENT',
        userEmail: 'test@example.com'
      };

      (mockDb.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      // Should not throw error
      await expect(securityService.logSecurityEvent(event)).resolves.not.toThrow();
    });
  });

  describe('checkLoginRateLimit', () => {
    it('should allow login when no previous attempts', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // email check
        .mockResolvedValueOnce({ rows: [] }); // IP check

      const result = await securityService.checkLoginRateLimit('test@example.com', '192.168.1.1');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(5);
    });

    it('should allow login when attempts are within limit', async () => {
      const now = new Date();
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{
            attempt_count: 2,
            last_attempt_at: now,
            locked_until: null
          }]
        }) // email check
        .mockResolvedValueOnce({ rows: [] }); // IP check

      const result = await securityService.checkLoginRateLimit('test@example.com', '192.168.1.1');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(3);
    });

    it('should deny login when account is locked', async () => {
      const now = new Date();
      const lockUntil = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{
            attempt_count: 5,
            last_attempt_at: now,
            locked_until: lockUntil
          }]
        }) // email check
        .mockResolvedValueOnce({ rows: [] }); // IP check

      const result = await securityService.checkLoginRateLimit('test@example.com', '192.168.1.1');

      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
      expect(result.lockoutTimeRemaining).toBeGreaterThan(0);
      expect(result.resetTime).toEqual(lockUntil);
    });

    it('should reset attempts when outside time window', async () => {
      const oldAttempt = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
      
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{
            attempt_count: 3,
            last_attempt_at: oldAttempt,
            locked_until: null
          }]
        }) // email check
        .mockResolvedValueOnce({ rows: [] }) // IP check
        .mockResolvedValueOnce({ rows: [] }); // reset attempts

      const result = await securityService.checkLoginRateLimit('test@example.com', '192.168.1.1');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(5);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE login_attempts'),
        ['test@example.com', 'EMAIL']
      );
    });

    it('should handle database errors gracefully', async () => {
      (mockDb.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await securityService.checkLoginRateLimit('test@example.com', '192.168.1.1');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(5);
    });
  });

  describe('recordFailedLoginAttempt', () => {
    it('should record failed attempts for both email and IP', async () => {
      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [] });

      await securityService.recordFailedLoginAttempt('test@example.com', '192.168.1.1');

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO login_attempts'),
        ['test@example.com', 'EMAIL']
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO login_attempts'),
        ['192.168.1.1', 'IP']
      );
    });

    it('should handle database errors gracefully', async () => {
      (mockDb.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(securityService.recordFailedLoginAttempt('test@example.com', '192.168.1.1'))
        .resolves.not.toThrow();
    });
  });

  describe('clearLoginAttempts', () => {
    it('should clear attempts for both email and IP', async () => {
      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [] });

      await securityService.clearLoginAttempts('test@example.com', '192.168.1.1');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM login_attempts'),
        ['test@example.com', '192.168.1.1']
      );
    });

    it('should handle database errors gracefully', async () => {
      (mockDb.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(securityService.clearLoginAttempts('test@example.com', '192.168.1.1'))
        .resolves.not.toThrow();
    });
  });

  describe('getSecurityEventStats', () => {
    it('should return security event statistics', async () => {
      (mockDb.query as jest.Mock).mockResolvedValue({
        rows: [
          { event_type: 'INVALID_LOGIN_ATTEMPT', count: '10' },
          { event_type: 'SUCCESSFUL_LOGIN', count: '50' },
          { event_type: 'RATE_LIMIT_EXCEEDED', count: '5' }
        ]
      });

      const stats = await securityService.getSecurityEventStats(24);

      expect(stats).toEqual({
        'INVALID_LOGIN_ATTEMPT': 10,
        'SUCCESSFUL_LOGIN': 50,
        'RATE_LIMIT_EXCEEDED': 5
      });
    });

    it('should handle database errors gracefully', async () => {
      (mockDb.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      const stats = await securityService.getSecurityEventStats(24);

      expect(stats).toEqual({});
    });
  });

  describe('extractSecurityContext', () => {
    it('should extract IP address from x-forwarded-for header', () => {
      const req = {
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1',
          'user-agent': 'Mozilla/5.0'
        },
        connection: {},
        socket: {}
      } as unknown as Request;

      const context = securityService.extractSecurityContext(req);

      expect(context.ipAddress).toBe('192.168.1.1');
      expect(context.userAgent).toBe('Mozilla/5.0');
    });

    it('should extract IP address from x-real-ip header when x-forwarded-for is not available', () => {
      const req = {
        headers: {
          'x-real-ip': '192.168.1.2',
          'user-agent': 'Mozilla/5.0'
        },
        connection: {},
        socket: {}
      } as unknown as Request;

      const context = securityService.extractSecurityContext(req);

      expect(context.ipAddress).toBe('192.168.1.2');
    });

    it('should extract IP address from connection when headers are not available', () => {
      const req = {
        headers: {
          'user-agent': 'Mozilla/5.0'
        },
        connection: {
          remoteAddress: '192.168.1.3'
        },
        socket: {}
      } as unknown as Request;

      const context = securityService.extractSecurityContext(req);

      expect(context.ipAddress).toBe('192.168.1.3');
    });

    it('should use unknown when no IP address is available', () => {
      const req = {
        headers: {
          'user-agent': 'Mozilla/5.0'
        },
        connection: {},
        socket: {}
      } as unknown as Request;

      const context = securityService.extractSecurityContext(req);

      expect(context.ipAddress).toBe('unknown');
      expect(context.userAgent).toBe('Mozilla/5.0');
    });

    it('should use unknown when user-agent is not available', () => {
      const req = {
        headers: {},
        connection: {
          remoteAddress: '192.168.1.1'
        },
        socket: {}
      } as unknown as Request;

      const context = securityService.extractSecurityContext(req);

      expect(context.ipAddress).toBe('192.168.1.1');
      expect(context.userAgent).toBe('unknown');
    });
  });
});