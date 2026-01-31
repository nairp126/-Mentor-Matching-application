import { EncryptionUtils, DatabaseEncryption } from '../encryption';

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = {
    ...originalEnv,
    ENCRYPTION_KEY: 'dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcw==', // base64 encoded test key
    ENCRYPTION_SALT: 'dGVzdC1zYWx0LTMyLWJ5dGVz', // base64 encoded test salt
    HMAC_SECRET: 'test-hmac-secret'
  };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('EncryptionUtils', () => {
  describe('generateKey', () => {
    it('should generate a base64 encoded key', () => {
      const key = EncryptionUtils.generateKey();
      expect(key).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(Buffer.from(key, 'base64')).toHaveLength(32);
    });
  });

  describe('generateSalt', () => {
    it('should generate a base64 encoded salt', () => {
      const salt = EncryptionUtils.generateSalt();
      expect(salt).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(Buffer.from(salt, 'base64')).toHaveLength(32);
    });
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt data successfully', () => {
      const plaintext = 'sensitive data to encrypt';
      const encrypted = EncryptionUtils.encrypt(plaintext);
      const decrypted = EncryptionUtils.decrypt(encrypted);
      
      expect(encrypted).not.toBe(plaintext);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt with additional authenticated data', () => {
      const plaintext = 'sensitive data';
      const aad = 'additional-data';
      const encrypted = EncryptionUtils.encrypt(plaintext, aad);
      const decrypted = EncryptionUtils.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different encrypted values for same input', () => {
      const plaintext = 'same input';
      const encrypted1 = EncryptionUtils.encrypt(plaintext);
      const encrypted2 = EncryptionUtils.encrypt(plaintext);
      
      expect(encrypted1).not.toBe(encrypted2);
      expect(EncryptionUtils.decrypt(encrypted1)).toBe(plaintext);
      expect(EncryptionUtils.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should throw error for invalid encrypted data', () => {
      expect(() => {
        EncryptionUtils.decrypt('invalid-encrypted-data');
      }).toThrow('Failed to decrypt data');
    });
  });

  describe('hash and verifyHash', () => {
    it('should hash and verify data successfully', () => {
      const data = 'password123';
      const hashed = EncryptionUtils.hash(data);
      
      expect(hashed).not.toBe(data);
      expect(EncryptionUtils.verifyHash(data, hashed)).toBe(true);
      expect(EncryptionUtils.verifyHash('wrong-password', hashed)).toBe(false);
    });

    it('should use provided salt for hashing', () => {
      const data = 'password123';
      const salt = 'custom-salt-hex';
      const hashed = EncryptionUtils.hash(data, salt);
      
      expect(EncryptionUtils.verifyHash(data, hashed)).toBe(true);
    });

    it('should return false for invalid hash format', () => {
      const data = 'password123';
      const invalidHash = 'invalid-hash-format';
      
      expect(EncryptionUtils.verifyHash(data, invalidHash)).toBe(false);
    });
  });

  describe('encryptField and decryptField', () => {
    it('should encrypt and decrypt database fields', () => {
      const value = 'user@example.com';
      const fieldName = 'email';
      
      const encrypted = EncryptionUtils.encryptField(value, fieldName);
      const decrypted = EncryptionUtils.decryptField(encrypted);
      
      expect(encrypted).not.toBe(value);
      expect(decrypted).toBe(value);
    });
  });

  describe('encryptPII and decryptPII', () => {
    it('should encrypt and decrypt PII data', () => {
      const piiData = '123-45-6789';
      const dataType = 'ssn';
      
      const encrypted = EncryptionUtils.encryptPII(piiData, dataType);
      const decrypted = EncryptionUtils.decryptPII(encrypted);
      
      expect(encrypted).not.toBe(piiData);
      expect(decrypted).toBe(piiData);
    });
  });

  describe('generateToken', () => {
    it('should generate random tokens', () => {
      const token1 = EncryptionUtils.generateToken();
      const token2 = EncryptionUtils.generateToken();
      
      expect(token1).not.toBe(token2);
      expect(token1).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(token1).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate tokens of specified length', () => {
      const token = EncryptionUtils.generateToken(16);
      expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
    });
  });

  describe('generatePassword', () => {
    it('should generate random passwords', () => {
      const password1 = EncryptionUtils.generatePassword();
      const password2 = EncryptionUtils.generatePassword();
      
      expect(password1).not.toBe(password2);
      expect(password1).toHaveLength(16);
    });

    it('should generate passwords of specified length', () => {
      const password = EncryptionUtils.generatePassword(12);
      expect(password).toHaveLength(12);
    });

    it('should only contain allowed characters', () => {
      const password = EncryptionUtils.generatePassword(100);
      const allowedChars = /^[ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*]+$/;
      expect(password).toMatch(allowedChars);
    });
  });

  describe('createSignature and verifySignature', () => {
    it('should create and verify signatures', () => {
      const data = 'data to sign';
      const signature = EncryptionUtils.createSignature(data);
      
      expect(EncryptionUtils.verifySignature(data, signature)).toBe(true);
      expect(EncryptionUtils.verifySignature('different data', signature)).toBe(false);
    });

    it('should use custom secret for signing', () => {
      const data = 'data to sign';
      const secret = 'custom-secret';
      const signature = EncryptionUtils.createSignature(data, secret);
      
      expect(EncryptionUtils.verifySignature(data, signature, secret)).toBe(true);
      expect(EncryptionUtils.verifySignature(data, signature, 'wrong-secret')).toBe(false);
    });
  });

  describe('maskSensitiveData', () => {
    it('should mask data correctly', () => {
      const data = 'sensitive123';
      const masked = EncryptionUtils.maskSensitiveData(data);
      
      expect(masked).toBe('se*******23');
    });

    it('should handle short data', () => {
      const data = 'abc';
      const masked = EncryptionUtils.maskSensitiveData(data);
      
      expect(masked).toBe('***');
    });

    it('should handle custom visible characters', () => {
      const data = 'sensitive123';
      const masked = EncryptionUtils.maskSensitiveData(data, 3);
      
      expect(masked).toBe('sen*****123');
    });
  });

  describe('sanitizeData', () => {
    it('should remove dangerous characters', () => {
      const data = '<script>alert("xss")</script>';
      const sanitized = EncryptionUtils.sanitizeData(data);
      
      expect(sanitized).toBe('scriptalert(xss)/script');
    });

    it('should remove control characters', () => {
      const data = 'normal\x00text\x1f';
      const sanitized = EncryptionUtils.sanitizeData(data);
      
      expect(sanitized).toBe('normaltext');
    });

    it('should trim whitespace', () => {
      const data = '  normal text  ';
      const sanitized = EncryptionUtils.sanitizeData(data);
      
      expect(sanitized).toBe('normal text');
    });
  });

  describe('isEncrypted', () => {
    it('should detect encrypted data', () => {
      const plaintext = 'test data';
      const encrypted = EncryptionUtils.encrypt(plaintext);
      
      expect(EncryptionUtils.isEncrypted(encrypted)).toBe(true);
      expect(EncryptionUtils.isEncrypted(plaintext)).toBe(false);
    });

    it('should handle invalid data', () => {
      expect(EncryptionUtils.isEncrypted('invalid-data')).toBe(false);
      expect(EncryptionUtils.isEncrypted('')).toBe(false);
    });
  });
});

describe('DatabaseEncryption', () => {
  beforeEach(() => {
    // Reset registered fields
    DatabaseEncryption.registerEncryptedFields([]);
  });

  describe('registerEncryptedFields', () => {
    it('should register fields for encryption', () => {
      DatabaseEncryption.registerEncryptedFields(['email', 'phone']);
      const fields = DatabaseEncryption.getEncryptedFields();
      
      expect(fields).toContain('email');
      expect(fields).toContain('phone');
    });
  });

  describe('encryptForStorage', () => {
    it('should encrypt registered fields', () => {
      DatabaseEncryption.registerEncryptedFields(['email']);
      
      const data = {
        id: '123',
        email: 'user@example.com',
        name: 'John Doe'
      };
      
      const encrypted = DatabaseEncryption.encryptForStorage(data);
      
      expect(encrypted.id).toBe('123');
      expect(encrypted.name).toBe('John Doe');
      expect(encrypted.email).not.toBe('user@example.com');
      expect(EncryptionUtils.isEncrypted(encrypted.email)).toBe(true);
    });

    it('should not encrypt unregistered fields', () => {
      DatabaseEncryption.registerEncryptedFields(['email']);
      
      const data = {
        email: 'user@example.com',
        phone: '123-456-7890'
      };
      
      const encrypted = DatabaseEncryption.encryptForStorage(data);
      
      expect(encrypted.phone).toBe('123-456-7890');
      expect(encrypted.email).not.toBe('user@example.com');
    });

    it('should handle null and undefined values', () => {
      DatabaseEncryption.registerEncryptedFields(['email']);
      
      const data = {
        email: null,
        phone: undefined,
        name: ''
      };
      
      const encrypted = DatabaseEncryption.encryptForStorage(data);
      
      expect(encrypted.email).toBeNull();
      expect(encrypted.phone).toBeUndefined();
      expect(encrypted.name).toBe('');
    });
  });

  describe('decryptFromStorage', () => {
    it('should decrypt registered fields', () => {
      DatabaseEncryption.registerEncryptedFields(['email']);
      
      const originalData = {
        id: '123',
        email: 'user@example.com',
        name: 'John Doe'
      };
      
      const encrypted = DatabaseEncryption.encryptForStorage(originalData);
      const decrypted = DatabaseEncryption.decryptFromStorage(encrypted);
      
      expect(decrypted).toEqual(originalData);
    });

    it('should handle decryption errors gracefully', () => {
      DatabaseEncryption.registerEncryptedFields(['email']);
      
      const data = {
        email: 'invalid-encrypted-data'
      };
      
      const decrypted = DatabaseEncryption.decryptFromStorage(data);
      
      // Should keep original value if decryption fails
      expect(decrypted.email).toBe('invalid-encrypted-data');
    });

    it('should not decrypt unencrypted data', () => {
      DatabaseEncryption.registerEncryptedFields(['email']);
      
      const data = {
        email: 'plain-email@example.com'
      };
      
      const decrypted = DatabaseEncryption.decryptFromStorage(data);
      
      expect(decrypted.email).toBe('plain-email@example.com');
    });
  });
});