import request from 'supertest';
import { Express } from 'express';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { DatabaseManager, AuthUtils } from '@mentor-platform/shared';
import { authRoutes } from '../routes/auth';
import { errorHandler } from '../middleware/errorHandler';

// Mock speakeasy for consistent testing
jest.mock('speakeasy', () => ({
  generateSecret: jest.fn(() => ({
    base32: 'JBSWY3DPEHPK3PXP',
    otpauth_url: 'otpauth://totp/Mentor%20Platform%20(test@example.com)?secret=JBSWY3DPEHPK3PXP&issuer=Mentor%20Platform'
  })),
  totp: {
    verify: jest.fn()
  }
}));

// Mock the auth middleware
jest.mock('../middleware/authMiddleware', () => {
  const mockAuthMiddleware = (req: any, res: any, next: any) => {
    // Check if authorization header is present
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authorization token is required'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // Mock authenticated user for valid tokens
    req.user = {
      userId: 'test-user-id',
      role: 'STUDENT',
      permissions: []
    };
    next();
  };

  return {
    AuthMiddleware: {
      authenticate: () => mockAuthMiddleware,
      requireRole: () => (req: any, res: any, next: any) => next(),
      requirePermission: () => (req: any, res: any, next: any) => next(),
      authenticateAndAuthorize: () => [mockAuthMiddleware],
      authenticateAndRequirePermission: () => [mockAuthMiddleware]
    },
    auditMiddleware: () => (req: any, res: any, next: any) => next()
  };
});

// Helper function to create test app
function createTestApp(db: DatabaseManager): Express {
  const app = express();
  
  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  app.use('/', authRoutes(db));
  app.use(errorHandler);
  
  return app;
}

describe('MFA Integration Tests', () => {
  let app: Express;
  let mockDb: jest.Mocked<DatabaseManager>;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Create mock database
    mockDb = {
      query: jest.fn(),
      cache: jest.fn(),
      getCached: jest.fn(),
      deleteCached: jest.fn(),
      close: jest.fn()
    } as any;

    // Create app with mocked database
    app = createTestApp(mockDb);

    // Setup test user
    userId = 'test-user-id';
    authToken = AuthUtils.generateAccessToken(userId, 'STUDENT');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /mfa/setup', () => {
    it('should setup MFA for authenticated user', async () => {
      // Arrange
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ email: 'test@example.com' }]
        }) // Get user email
        .mockResolvedValueOnce({ rows: [] }) // Update user with secret
        .mockResolvedValue({ rows: [] }); // Backup codes operations

      // Act
      const response = await request(app)
        .post('/mfa/setup')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('secret');
      expect(response.body.data).toHaveProperty('qrCodeUrl');
      expect(response.body.data).toHaveProperty('backupCodes');
      expect(response.body.data.backupCodes).toHaveLength(10);
      expect(response.body.data.secret).toBe('JBSWY3DPEHPK3PXP');
      expect(response.body.data.qrCodeUrl).toBe('data:image/png;base64,mockqrcode');
    });

    it('should require authentication', async () => {
      // Act
      const response = await request(app)
        .post('/mfa/setup')
        .expect(401);

      // Assert
      expect(response.body.success).toBe(false);
    });

    it('should handle user not found', async () => {
      // Arrange
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      // Act
      const response = await request(app)
        .post('/mfa/setup')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('User not found');
    });
  });

  describe('POST /mfa/enable', () => {
    it('should enable MFA with valid code', async () => {
      // Arrange
      const speakeasy = require('speakeasy');
      speakeasy.totp.verify.mockReturnValue(true);

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            mfa_secret: 'JBSWY3DPEHPK3PXP',
            mfa_enabled: false
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // Update query

      // Act
      const response = await request(app)
        .post('/mfa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '123456' })
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('MFA enabled successfully');
    });

    it('should reject invalid code', async () => {
      // Arrange
      const speakeasy = require('speakeasy');
      speakeasy.totp.verify.mockReturnValue(false);

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          mfa_secret: 'JBSWY3DPEHPK3PXP',
          mfa_enabled: false
        }]
      });

      // Act
      const response = await request(app)
        .post('/mfa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '000000' })
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
    });

    it('should validate code format', async () => {
      // Act
      const response = await request(app)
        .post('/mfa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: 'invalid' })
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should require authentication', async () => {
      // Act
      const response = await request(app)
        .post('/mfa/enable')
        .send({ code: '123456' })
        .expect(401);

      // Assert
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /mfa/disable', () => {
    it('should disable MFA with valid code', async () => {
      // Arrange
      const speakeasy = require('speakeasy');
      speakeasy.totp.verify.mockReturnValue(true);

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            mfa_secret: 'JBSWY3DPEHPK3PXP',
            mfa_enabled: true
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // Backup codes query
        .mockResolvedValueOnce({ rows: [] }) // Update query
        .mockResolvedValueOnce({ rows: [] }); // Clear backup codes

      // Act
      const response = await request(app)
        .post('/mfa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '123456' })
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('MFA disabled successfully');
    });

    it('should reject when MFA not enabled', async () => {
      // Arrange
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          mfa_secret: 'JBSWY3DPEHPK3PXP',
          mfa_enabled: false
        }]
      });

      // Act
      const response = await request(app)
        .post('/mfa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '123456' })
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /mfa/status', () => {
    it('should return MFA status for user with MFA enabled', async () => {
      // Arrange
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ mfa_enabled: true }]
        })
        .mockResolvedValueOnce({
          rows: [{ count: '8' }]
        });

      // Act
      const response = await request(app)
        .get('/mfa/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        enabled: true,
        backupCodesRemaining: 8
      });
    });

    it('should return MFA status for user with MFA disabled', async () => {
      // Arrange
      mockDb.query.mockResolvedValueOnce({
        rows: [{ mfa_enabled: false }]
      });

      // Act
      const response = await request(app)
        .get('/mfa/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        enabled: false
      });
    });

    it('should require authentication', async () => {
      // Act
      const response = await request(app)
        .get('/mfa/status')
        .expect(401);

      // Assert
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /mfa/backup-codes/regenerate', () => {
    it('should regenerate backup codes with valid verification', async () => {
      // Arrange
      const speakeasy = require('speakeasy');
      speakeasy.totp.verify.mockReturnValue(true);

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            mfa_secret: 'JBSWY3DPEHPK3PXP',
            mfa_enabled: true
          }]
        })
        .mockResolvedValue({ rows: [] }); // For backup code operations

      // Act
      const response = await request(app)
        .post('/mfa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '123456' })
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('backupCodes');
      expect(response.body.data.backupCodes).toHaveLength(10);
      expect(response.body.data.message).toBe('New backup codes generated successfully');
    });

    it('should reject invalid verification code', async () => {
      // Arrange
      const speakeasy = require('speakeasy');
      speakeasy.totp.verify.mockReturnValue(false);

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          mfa_secret: 'JBSWY3DPEHPK3PXP',
          mfa_enabled: true
        }]
      });

      // Act
      const response = await request(app)
        .post('/mfa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '000000' })
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      // Act
      const response = await request(app)
        .post('/mfa/backup-codes/regenerate')
        .send({ code: '123456' })
        .expect(401);

      // Assert
      expect(response.body.success).toBe(false);
    });
  });

  describe('MFA Login Flow Integration', () => {
    it('should require MFA code when MFA is enabled', async () => {
      // Arrange
      const loginCredentials = {
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
          mfa_enabled: true,
          mfa_secret: 'JBSWY3DPEHPK3PXP',
          created_at: new Date(),
          updated_at: new Date(),
          last_login_at: null
        }]
      });

      jest.spyOn(AuthUtils, 'verifyPassword').mockResolvedValue(true);

      // Act
      const response = await request(app)
        .post('/login')
        .send(loginCredentials)
        .expect(401);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MFA_REQUIRED');
    });

    it('should authenticate successfully with valid MFA code', async () => {
      // Arrange
      const loginCredentials = {
        email: 'mfa@example.com',
        password: 'CorrectPassword123!',
        mfaCode: '123456'
      };

      const speakeasy = require('speakeasy');
      speakeasy.totp.verify.mockReturnValue(true);

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'mfa-user',
            email: 'mfa@example.com',
            password_hash: 'correct-hash',
            role: 'MENTOR',
            email_verified: true,
            mfa_enabled: true,
            mfa_secret: 'JBSWY3DPEHPK3PXP',
            created_at: new Date(),
            updated_at: new Date(),
            last_login_at: null
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // MFA verification query
        .mockResolvedValueOnce({ rows: [] }) // Update last login
        .mockResolvedValue({ rows: [] }); // Audit logs

      jest.spyOn(AuthUtils, 'verifyPassword').mockResolvedValue(true);
      jest.spyOn(AuthUtils, 'generateAccessToken').mockReturnValue('mfa-access-token');
      jest.spyOn(AuthUtils, 'generateRefreshToken').mockReturnValue('mfa-refresh-token');

      mockDb.cache.mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .post('/login')
        .send(loginCredentials)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.mfaEnabled).toBe(true);
    });

    it('should reject invalid MFA code during login', async () => {
      // Arrange
      const loginCredentials = {
        email: 'mfa@example.com',
        password: 'CorrectPassword123!',
        mfaCode: '000000'
      };

      const speakeasy = require('speakeasy');
      speakeasy.totp.verify.mockReturnValue(false);

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'mfa-user',
            email: 'mfa@example.com',
            password_hash: 'correct-hash',
            role: 'MENTOR',
            email_verified: true,
            mfa_enabled: true,
            mfa_secret: 'JBSWY3DPEHPK3PXP',
            created_at: new Date(),
            updated_at: new Date(),
            last_login_at: null
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // MFA verification query

      jest.spyOn(AuthUtils, 'verifyPassword').mockResolvedValue(true);

      // Act
      const response = await request(app)
        .post('/login')
        .send(loginCredentials)
        .expect(401);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_MFA_CODE');
    });
  });
});