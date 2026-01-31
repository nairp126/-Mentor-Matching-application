import crypto from 'crypto';

/**
 * Encryption utility for handling sensitive data encryption/decryption
 * Uses AES-256-GCM for authenticated encryption
 */
export class EncryptionUtils {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 16; // 128 bits
  private static readonly TAG_LENGTH = 16; // 128 bits
  private static readonly SALT_LENGTH = 32; // 256 bits

  /**
   * Get encryption key from environment or generate one
   */
  private static getEncryptionKey(): Buffer {
    const keyString = process.env.ENCRYPTION_KEY;
    
    if (!keyString) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    // If key is base64 encoded, decode it
    if (keyString.length === 44 && keyString.endsWith('=')) {
      return Buffer.from(keyString, 'base64');
    }

    // If key is hex encoded
    if (keyString.length === 64) {
      return Buffer.from(keyString, 'hex');
    }

    // Otherwise, derive key from string using PBKDF2
    const salt = Buffer.from(process.env.ENCRYPTION_SALT || 'default-salt-change-in-production', 'utf8');
    return crypto.pbkdf2Sync(keyString, salt, 100000, this.KEY_LENGTH, 'sha256');
  }

  /**
   * Generate a new encryption key (for setup/rotation)
   */
  static generateKey(): string {
    return crypto.randomBytes(this.KEY_LENGTH).toString('base64');
  }

  /**
   * Generate a new salt (for setup)
   */
  static generateSalt(): string {
    return crypto.randomBytes(this.SALT_LENGTH).toString('base64');
  }

  /**
   * Encrypt sensitive data
   * @param plaintext - The data to encrypt
   * @param additionalData - Optional additional authenticated data
   * @returns Encrypted data with IV and auth tag
   */
  static encrypt(plaintext: string, additionalData?: string): string {
    try {
      const key = this.getEncryptionKey();
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const cipher = crypto.createCipher(this.ALGORITHM, key);
      
      if (additionalData) {
        cipher.setAAD(Buffer.from(additionalData, 'utf8'));
      }

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();

      // Combine IV, auth tag, and encrypted data
      const result = {
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        encrypted: encrypted,
        aad: additionalData || null
      };

      return Buffer.from(JSON.stringify(result)).toString('base64');
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data
   * @param encryptedData - The encrypted data to decrypt
   * @returns Decrypted plaintext
   */
  static decrypt(encryptedData: string): string {
    try {
      const key = this.getEncryptionKey();
      const data = JSON.parse(Buffer.from(encryptedData, 'base64').toString('utf8'));
      
      const iv = Buffer.from(data.iv, 'hex');
      const authTag = Buffer.from(data.authTag, 'hex');
      const encrypted = data.encrypted;
      
      const decipher = crypto.createDecipher(this.ALGORITHM, key);
      decipher.setAuthTag(authTag);
      
      if (data.aad) {
        decipher.setAAD(Buffer.from(data.aad, 'utf8'));
      }

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Hash sensitive data (one-way)
   * @param data - The data to hash
   * @param salt - Optional salt (will generate if not provided)
   * @returns Hashed data with salt
   */
  static hash(data: string, salt?: string): string {
    try {
      const saltBuffer = salt ? Buffer.from(salt, 'hex') : crypto.randomBytes(this.SALT_LENGTH);
      const hash = crypto.pbkdf2Sync(data, saltBuffer, 100000, 64, 'sha256');
      
      return JSON.stringify({
        hash: hash.toString('hex'),
        salt: saltBuffer.toString('hex'),
        iterations: 100000,
        algorithm: 'pbkdf2-sha256'
      });
    } catch (error) {
      console.error('Hashing error:', error);
      throw new Error('Failed to hash data');
    }
  }

  /**
   * Verify hashed data
   * @param data - The original data
   * @param hashedData - The hashed data to verify against
   * @returns True if data matches hash
   */
  static verifyHash(data: string, hashedData: string): boolean {
    try {
      const hashInfo = JSON.parse(hashedData);
      const salt = Buffer.from(hashInfo.salt, 'hex');
      const originalHash = Buffer.from(hashInfo.hash, 'hex');
      
      const computedHash = crypto.pbkdf2Sync(data, salt, hashInfo.iterations, 64, 'sha256');
      
      return crypto.timingSafeEqual(originalHash, computedHash);
    } catch (error) {
      console.error('Hash verification error:', error);
      return false;
    }
  }

  /**
   * Encrypt database field (for storing encrypted data in database)
   * @param value - The value to encrypt
   * @param fieldName - The field name (used as additional authenticated data)
   * @returns Encrypted value suitable for database storage
   */
  static encryptField(value: string, fieldName: string): string {
    return this.encrypt(value, fieldName);
  }

  /**
   * Decrypt database field
   * @param encryptedValue - The encrypted value from database
   * @returns Decrypted value
   */
  static decryptField(encryptedValue: string): string {
    return this.decrypt(encryptedValue);
  }

  /**
   * Encrypt PII (Personally Identifiable Information)
   * @param piiData - The PII data to encrypt
   * @param dataType - The type of PII (email, phone, ssn, etc.)
   * @returns Encrypted PII data
   */
  static encryptPII(piiData: string, dataType: string): string {
    return this.encrypt(piiData, `pii:${dataType}`);
  }

  /**
   * Decrypt PII data
   * @param encryptedPII - The encrypted PII data
   * @returns Decrypted PII data
   */
  static decryptPII(encryptedPII: string): string {
    return this.decrypt(encryptedPII);
  }

  /**
   * Generate a secure random token
   * @param length - Token length in bytes (default: 32)
   * @returns Random token as hex string
   */
  static generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a secure random password
   * @param length - Password length (default: 16)
   * @returns Random password
   */
  static generatePassword(length: number = 16): string {
    const charset = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      password += charset[randomIndex];
    }
    
    return password;
  }

  /**
   * Create HMAC signature for data integrity
   * @param data - The data to sign
   * @param secret - The secret key for signing
   * @returns HMAC signature
   */
  static createSignature(data: string, secret?: string): string {
    const key = secret || process.env.HMAC_SECRET || 'default-hmac-secret-change-in-production';
    return crypto.createHmac('sha256', key).update(data).digest('hex');
  }

  /**
   * Verify HMAC signature
   * @param data - The original data
   * @param signature - The signature to verify
   * @param secret - The secret key used for signing
   * @returns True if signature is valid
   */
  static verifySignature(data: string, signature: string, secret?: string): boolean {
    try {
      const expectedSignature = this.createSignature(data, secret);
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Mask sensitive data for logging/display
   * @param data - The data to mask
   * @param visibleChars - Number of characters to show at start and end
   * @returns Masked data
   */
  static maskSensitiveData(data: string, visibleChars: number = 2): string {
    if (!data || data.length <= visibleChars * 2) {
      return '*'.repeat(data?.length || 0);
    }

    const start = data.substring(0, visibleChars);
    const end = data.substring(data.length - visibleChars);
    const middle = '*'.repeat(data.length - visibleChars * 2);
    
    return `${start}${middle}${end}`;
  }

  /**
   * Sanitize data for safe storage/transmission
   * @param data - The data to sanitize
   * @returns Sanitized data
   */
  static sanitizeData(data: string): string {
    // Remove potentially dangerous characters
    return data
      .replace(/[<>\"'&]/g, '') // Remove HTML/XML characters
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
      .trim();
  }

  /**
   * Check if data appears to be encrypted
   * @param data - The data to check
   * @returns True if data appears to be encrypted
   */
  static isEncrypted(data: string): boolean {
    try {
      // Check if it's base64 encoded and contains our structure
      const decoded = Buffer.from(data, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      
      return !!(parsed.iv && parsed.authTag && parsed.encrypted);
    } catch {
      return false;
    }
  }
}

/**
 * Database encryption middleware for automatic field encryption/decryption
 */
export class DatabaseEncryption {
  private static encryptedFields = new Set<string>();

  /**
   * Register fields that should be automatically encrypted
   * @param fields - Array of field names to encrypt
   */
  static registerEncryptedFields(fields: string[]): void {
    fields.forEach(field => this.encryptedFields.add(field));
  }

  /**
   * Encrypt data before database insertion
   * @param data - The data object to process
   * @returns Data with encrypted fields
   */
  static encryptForStorage(data: any): any {
    const result = { ...data };
    
    for (const [key, value] of Object.entries(result)) {
      if (this.encryptedFields.has(key) && typeof value === 'string' && value) {
        result[key] = EncryptionUtils.encryptField(value, key);
      }
    }
    
    return result;
  }

  /**
   * Decrypt data after database retrieval
   * @param data - The data object to process
   * @returns Data with decrypted fields
   */
  static decryptFromStorage(data: any): any {
    const result = { ...data };
    
    for (const [key, value] of Object.entries(result)) {
      if (this.encryptedFields.has(key) && typeof value === 'string' && value) {
        try {
          if (EncryptionUtils.isEncrypted(value)) {
            result[key] = EncryptionUtils.decryptField(value);
          }
        } catch (error) {
          console.error(`Failed to decrypt field ${key}:`, error);
          // Keep original value if decryption fails
        }
      }
    }
    
    return result;
  }

  /**
   * Get list of registered encrypted fields
   * @returns Array of encrypted field names
   */
  static getEncryptedFields(): string[] {
    return Array.from(this.encryptedFields);
  }
}

// Register commonly encrypted fields
DatabaseEncryption.registerEncryptedFields([
  'email',
  'phone',
  'address',
  'ssn',
  'credit_card',
  'bank_account',
  'personal_notes',
  'medical_info',
  'financial_data'
]);