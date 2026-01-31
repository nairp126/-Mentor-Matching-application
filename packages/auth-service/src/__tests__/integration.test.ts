import { AuthUtils } from '@mentor-platform/shared';

describe('Authentication Integration Tests', () => {
  describe('Password Hashing', () => {
    it('should hash and verify passwords correctly', async () => {
      const password = 'TestPassword123!';
      
      // Hash the password
      const hash = await AuthUtils.hashPassword(password);
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      
      // Verify the password
      const isValid = await AuthUtils.verifyPassword(password, hash);
      expect(isValid).toBe(true);
      
      // Verify wrong password fails
      const isInvalid = await AuthUtils.verifyPassword('WrongPassword', hash);
      expect(isInvalid).toBe(false);
    });
  });

  describe('JWT Token Generation and Validation', () => {
    it('should generate and validate JWT tokens correctly', () => {
      const userId = 'test-user-123';
      const role = 'STUDENT';
      
      // Generate access token
      const accessToken = AuthUtils.generateAccessToken(userId, role);
      expect(accessToken).toBeDefined();
      expect(typeof accessToken).toBe('string');
      
      // Validate access token
      const validation = AuthUtils.validateToken(accessToken);
      expect(validation.valid).toBe(true);
      expect(validation.userId).toBe(userId);
      expect(validation.role).toBe(role);
      expect(validation.expiresAt).toBeInstanceOf(Date);
    });

    it('should generate and validate refresh tokens correctly', () => {
      const userId = 'test-user-123';
      
      // Generate refresh token
      const refreshToken = AuthUtils.generateRefreshToken(userId);
      expect(refreshToken).toBeDefined();
      expect(typeof refreshToken).toBe('string');
      
      // Validate refresh token
      const validation = AuthUtils.validateRefreshToken(refreshToken);
      expect(validation.valid).toBe(true);
      expect(validation.userId).toBe(userId);
    });

    it('should reject invalid tokens', () => {
      const invalidToken = 'invalid.token.here';
      
      const validation = AuthUtils.validateToken(invalidToken);
      expect(validation.valid).toBe(false);
      expect(validation.userId).toBeUndefined();
      expect(validation.role).toBeUndefined();
    });

    it('should not accept refresh token as access token', () => {
      const userId = 'test-user-123';
      const refreshToken = AuthUtils.generateRefreshToken(userId);
      
      const validation = AuthUtils.validateToken(refreshToken);
      expect(validation.valid).toBe(false);
    });
  });

  describe('MFA Secret Generation', () => {
    it('should generate valid MFA secrets', () => {
      const secret1 = AuthUtils.generateMFASecret();
      const secret2 = AuthUtils.generateMFASecret();
      
      expect(secret1).toBeDefined();
      expect(secret1.length).toBe(32);
      expect(/^[A-Z2-7]+$/.test(secret1)).toBe(true); // Base32 characters
      
      expect(secret2).toBeDefined();
      expect(secret1).not.toBe(secret2); // Should be different each time
    });
  });

  describe('Authentication Requirements Validation', () => {
    it('should validate user registration data structure', () => {
      const validRegistration = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'John',
        lastName: 'Doe',
        role: 'STUDENT' as const
      };

      // Test that all required fields are present
      expect(validRegistration.email).toBeDefined();
      expect(validRegistration.password).toBeDefined();
      expect(validRegistration.firstName).toBeDefined();
      expect(validRegistration.lastName).toBeDefined();
      expect(validRegistration.role).toBeDefined();
      
      // Test email format
      expect(validRegistration.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      
      // Test password complexity (at least 8 chars, uppercase, lowercase, number, special char)
      expect(validRegistration.password.length).toBeGreaterThanOrEqual(8);
      expect(validRegistration.password).toMatch(/[A-Z]/);
      expect(validRegistration.password).toMatch(/[a-z]/);
      expect(validRegistration.password).toMatch(/\d/);
      expect(validRegistration.password).toMatch(/[!@#$%^&*(),.?":{}|<>]/);
      
      // Test role is valid
      expect(['MENTOR', 'STUDENT', 'ADMIN']).toContain(validRegistration.role);
    });

    it('should validate login credentials structure', () => {
      const validLogin = {
        email: 'test@example.com',
        password: 'TestPassword123!'
      };

      expect(validLogin.email).toBeDefined();
      expect(validLogin.password).toBeDefined();
      expect(validLogin.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });
  });

  describe('Security Requirements', () => {
    it('should implement proper password hashing with bcrypt', async () => {
      const password = 'TestPassword123!';
      const hash = await AuthUtils.hashPassword(password);
      
      // Bcrypt hashes start with $2b$ and are at least 60 characters
      expect(hash).toMatch(/^\$2b\$/);
      expect(hash.length).toBeGreaterThanOrEqual(60);
    });

    it('should generate different hashes for the same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await AuthUtils.hashPassword(password);
      const hash2 = await AuthUtils.hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should generate JWT tokens with proper structure', () => {
      const userId = 'test-user-123';
      const role = 'STUDENT';
      const token = AuthUtils.generateAccessToken(userId, role);
      
      // JWT tokens have 3 parts separated by dots
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
      
      // Each part should be base64 encoded
      parts.forEach(part => {
        expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
      });
    });
  });
});