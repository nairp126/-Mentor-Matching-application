import { AuthUtils } from '../auth';

describe('AuthUtils', () => {
  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'testPassword123';
      const hash = await AuthUtils.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should generate different hashes for the same password', async () => {
      const password = 'testPassword123';
      const hash1 = await AuthUtils.hashPassword(password);
      const hash2 = await AuthUtils.hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'testPassword123';
      const hash = await AuthUtils.hashPassword(password);
      
      const isValid = await AuthUtils.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword';
      const hash = await AuthUtils.hashPassword(password);
      
      const isValid = await AuthUtils.verifyPassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });
  });

  describe('generateAccessToken', () => {
    it('should generate a valid JWT token', () => {
      const userId = 'test-user-id';
      const role = 'STUDENT';
      
      const token = AuthUtils.generateAccessToken(userId, role);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', () => {
      const userId = 'test-user-id';
      const role = 'STUDENT';
      const token = AuthUtils.generateAccessToken(userId, role);
      
      const validation = AuthUtils.validateToken(token);
      
      expect(validation.valid).toBe(true);
      expect(validation.userId).toBe(userId);
      expect(validation.role).toBe(role);
      expect(validation.expiresAt).toBeInstanceOf(Date);
    });

    it('should reject invalid token', () => {
      const invalidToken = 'invalid.token.here';
      
      const validation = AuthUtils.validateToken(invalidToken);
      
      expect(validation.valid).toBe(false);
      expect(validation.userId).toBeUndefined();
      expect(validation.role).toBeUndefined();
    });

    it('should reject refresh token as access token', () => {
      const userId = 'test-user-id';
      const refreshToken = AuthUtils.generateRefreshToken(userId);
      
      const validation = AuthUtils.validateToken(refreshToken);
      
      expect(validation.valid).toBe(false);
    });
  });

  describe('generateMFASecret', () => {
    it('should generate a 32-character MFA secret', () => {
      const secret = AuthUtils.generateMFASecret();
      
      expect(secret).toBeDefined();
      expect(secret.length).toBe(32);
      expect(/^[A-Z2-7]+$/.test(secret)).toBe(true); // Base32 characters
    });

    it('should generate different secrets each time', () => {
      const secret1 = AuthUtils.generateMFASecret();
      const secret2 = AuthUtils.generateMFASecret();
      
      expect(secret1).not.toBe(secret2);
    });
  });
});