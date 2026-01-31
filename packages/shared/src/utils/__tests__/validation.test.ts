import { validateSchema, userRegistrationSchema, loginCredentialsSchema } from '../validation';

describe('Validation Utils', () => {
  describe('userRegistrationSchema', () => {
    it('should validate valid user registration data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Doe',
        role: 'STUDENT'
      };

      const { value, error } = validateSchema(userRegistrationSchema, validData);
      
      expect(error).toBeUndefined();
      expect(value).toEqual(validData);
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'invalid-email',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Doe',
        role: 'STUDENT'
      };

      const { error } = validateSchema(userRegistrationSchema, invalidData);
      
      expect(error).toBeDefined();
      expect(error?.details[0].path).toEqual(['email']);
    });

    it('should reject weak password', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'weak',
        firstName: 'John',
        lastName: 'Doe',
        role: 'STUDENT'
      };

      const { error } = validateSchema(userRegistrationSchema, invalidData);
      
      expect(error).toBeDefined();
      expect(error?.details[0].path).toEqual(['password']);
    });

    it('should reject invalid role', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Doe',
        role: 'INVALID_ROLE'
      };

      const { error } = validateSchema(userRegistrationSchema, invalidData);
      
      expect(error).toBeDefined();
      expect(error?.details[0].path).toEqual(['role']);
    });
  });

  describe('loginCredentialsSchema', () => {
    it('should validate valid login credentials', () => {
      const validData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const { value, error } = validateSchema(loginCredentialsSchema, validData);
      
      expect(error).toBeUndefined();
      expect(value).toEqual(validData);
    });

    it('should validate login credentials with MFA code', () => {
      const validData = {
        email: 'test@example.com',
        password: 'password123',
        mfaCode: '123456'
      };

      const { value, error } = validateSchema(loginCredentialsSchema, validData);
      
      expect(error).toBeUndefined();
      expect(value).toEqual(validData);
    });

    it('should reject invalid MFA code format', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'password123',
        mfaCode: 'abc123'
      };

      const { error } = validateSchema(loginCredentialsSchema, invalidData);
      
      expect(error).toBeDefined();
      expect(error?.details[0].path).toEqual(['mfaCode']);
    });
  });
});