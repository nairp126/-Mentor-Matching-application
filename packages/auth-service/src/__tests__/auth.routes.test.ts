import request from 'supertest';
import express from 'express';
import { DatabaseManager } from '@mentor-platform/shared';
import { authRoutes } from '../routes/auth';
import { AuthService } from '../services/authService';
import { errorHandler } from '../middleware/errorHandler';

// Mock dependencies
jest.mock('@mentor-platform/shared', () => ({
  DatabaseManager: jest.fn(),
  userRegistrationSchema: {
    validate: jest.fn().mockReturnValue({ value: {}, error: null })
  },
  loginCredentialsSchema: {
    validate: jest.fn().mockReturnValue({ value: {}, error: null })
  },
  mfaCodeSchema: {
    validate: jest.fn().mockReturnValue({ value: {}, error: null })
  },
  AuthUtils: {
    hashPassword: jest.fn(),
    verifyPassword: jest.fn(),
    generateAccessToken: jest.fn(),
    generateRefreshToken: jest.fn(),
    validateToken: jest.fn(),
    validateRefreshToken: jest.fn()
  },
  validateSchema: jest.fn().mockImplementation((schema, data) => {
    // Mock validation failure for invalid data
    if (data.email === 'invalid-email' || data.password === '123') {
      return {
        value: data,
        error: {
          details: [
            { path: ['email'], message: 'Invalid email format' },
            { path: ['password'], message: 'Password too short' }
          ]
        }
      };
    }
    return { value: data, error: null };
  })
}));

jest.mock('../services/authService');

const mockDb = {
  query: jest.fn(),
  cache: jest.fn(),
  getCached: jest.fn(),
  deleteCached: jest.fn()
} as unknown as DatabaseManager;

const mockSecurityService = {
  extractSecurityContext: jest.fn().mockReturnValue({
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent'
  })
};

const mockMFAService = {
  setupMFA: jest.fn(),
  enableMFA: jest.fn(),
  disableMFA: jest.fn(),
  getMFAStatus: jest.fn(),
  generateNewBackupCodes: jest.fn()
};

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refreshToken: jest.fn(),
  logout: jest.fn(),
  verifyEmail: jest.fn(),
  requestPasswordReset: jest.fn(),
  getMFAService: jest.fn().mockReturnValue(mockMFAService),
  getSecurityService: jest.fn().mockReturnValue(mockSecurityService),
  logAuditEvent: jest.fn()
} as unknown as AuthService;

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock the AuthService constructor to return our mock
  (AuthService as jest.MockedClass<typeof AuthService>).mockImplementation(() => mockAuthService);
  
  app.use('/', authRoutes(mockDb));
  
  // Add error handler middleware
  app.use(errorHandler);
  
  return app;
};

describe('Auth Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp();
  });

  describe('POST /register', () => {
    const validRegistrationData = {
      email: 'test@example.com',
      password: 'TestPassword123!',
      firstName: 'John',
      lastName: 'Doe',
      role: 'STUDENT'
    };

    it('should successfully register a user', async () => {
      (mockAuthService.register as jest.Mock).mockResolvedValue({
        success: true,
        message: 'User registered successfully',
        userId: 'user-123'
      });

      const response = await request(app)
        .post('/register')
        .send(validRegistrationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('registered successfully');
      expect(response.body.data.userId).toBe('user-123');
      expect(mockAuthService.register).toHaveBeenCalledWith(validRegistrationData);
    });

    it('should return validation error for invalid data', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: '123', // too short
        firstName: '',
        lastName: '',
        role: 'INVALID_ROLE'
      };

      const response = await request(app)
        .post('/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle registration service errors', async () => {
      (mockAuthService.register as jest.Mock).mockRejectedValue(
        new Error('User already exists')
      );

      const response = await request(app)
        .post('/register')
        .send(validRegistrationData)
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'TestPassword123!'
    };

    const mockAuthResult = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      user: {
        id: 'user-123',
        email: 'test@example.com',
        role: 'STUDENT',
        emailVerified: true,
        mfaEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
        passwordHash: 'should-be-removed'
      }
    };

    it('should successfully login a user', async () => {
      (mockAuthService.login as jest.Mock).mockResolvedValue(mockAuthResult);

      const response = await request(app)
        .post('/login')
        .send(validLoginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBe('access-token');
      expect(response.body.data.refreshToken).toBe('refresh-token');
      expect(response.body.data.user.passwordHash).toBeUndefined(); // Should be filtered out
      expect(mockAuthService.login).toHaveBeenCalledWith(validLoginData, '127.0.0.1', 'test-agent');
    });

    it('should return validation error for invalid login data', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: ''
      };

      const response = await request(app)
        .post('/login')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle login service errors', async () => {
      (mockAuthService.login as jest.Mock).mockRejectedValue(
        new Error('Invalid credentials')
      );

      const response = await request(app)
        .post('/login')
        .send(validLoginData)
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /refresh', () => {
    it('should successfully refresh token', async () => {
      const mockRefreshResult = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'STUDENT',
          emailVerified: true,
          mfaEnabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLoginAt: new Date(),
          passwordHash: 'should-be-removed'
        }
      };

      (mockAuthService.refreshToken as jest.Mock).mockResolvedValue(mockRefreshResult);

      const response = await request(app)
        .post('/refresh')
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBe('new-access-token');
      expect(response.body.data.user.passwordHash).toBeUndefined(); // Should be filtered out
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('valid-refresh-token');
    });

    it('should return error when refresh token is missing', async () => {
      const response = await request(app)
        .post('/refresh')
        .send({})
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('should handle refresh service errors', async () => {
      (mockAuthService.refreshToken as jest.Mock).mockRejectedValue(
        new Error('Invalid refresh token')
      );

      const response = await request(app)
        .post('/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /verify-email/:token', () => {
    it('should successfully verify email', async () => {
      (mockAuthService.verifyEmail as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Email verified successfully'
      });

      const response = await request(app)
        .get('/verify-email/valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Email verified successfully');
      expect(mockAuthService.verifyEmail).toHaveBeenCalledWith('valid-token');
    });

    it('should handle verification service errors', async () => {
      (mockAuthService.verifyEmail as jest.Mock).mockRejectedValue(
        new Error('Invalid verification token')
      );

      const response = await request(app)
        .get('/verify-email/invalid-token')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /forgot-password', () => {
    it('should successfully request password reset', async () => {
      (mockAuthService.requestPasswordReset as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Password reset link has been sent'
      });

      const response = await request(app)
        .post('/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('reset link has been sent');
      expect(mockAuthService.requestPasswordReset).toHaveBeenCalledWith('test@example.com');
    });

    it('should return error when email is missing', async () => {
      const response = await request(app)
        .post('/forgot-password')
        .send({})
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });
});