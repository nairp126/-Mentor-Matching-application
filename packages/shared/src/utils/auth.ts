import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { TokenValidation, UserRole } from '../types';

const SALT_ROUNDS = 12;

export class AuthUtils {
  private static getJwtSecret(): string {
    return process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  }

  private static getJwtExpiresIn(): string {
    return process.env.JWT_EXPIRES_IN || '1h';
  }

  private static getRefreshTokenExpiresIn(): string {
    return process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
  }

  /**
   * Hash a password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Verify a password against its hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate a JWT access token
   */
  static generateAccessToken(userId: string, role: UserRole): string {
    return jwt.sign(
      { userId, role, type: 'access' },
      this.getJwtSecret(),
      { expiresIn: this.getJwtExpiresIn() } as any
    );
  }

  /**
   * Generate a JWT refresh token
   */
  static generateRefreshToken(userId: string): string {
    return jwt.sign(
      { userId, type: 'refresh' },
      this.getJwtSecret(),
      { expiresIn: this.getRefreshTokenExpiresIn() } as any
    );
  }

  /**
   * Validate and decode a JWT token
   */
  static validateToken(token: string): TokenValidation {
    try {
      const decoded = jwt.verify(token, this.getJwtSecret()) as any;

      if (decoded.type !== 'access') {
        return { valid: false };
      }

      return {
        valid: true,
        userId: decoded.userId,
        role: decoded.role,
        expiresAt: new Date(decoded.exp * 1000)
      };
    } catch (error) {
      return { valid: false };
    }
  }

  /**
   * Validate a refresh token
   */
  static validateRefreshToken(token: string): { valid: boolean; userId?: string } {
    try {
      const decoded = jwt.verify(token, this.getJwtSecret()) as any;

      if (decoded.type !== 'refresh') {
        return { valid: false };
      }

      return {
        valid: true,
        userId: decoded.userId
      };
    } catch (error) {
      return { valid: false };
    }
  }

  /**
   * Generate a secure random string for MFA secrets
   */
  static generateMFASecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Create authentication middleware for Express
   */
  static createAuthMiddleware(requiredRoles?: UserRole[]) {
    return (req: any, res: any, next: any): void => {
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

      const token = authHeader.substring(7);
      const validation = AuthUtils.validateToken(token);

      if (!validation.valid) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token'
          },
          timestamp: new Date().toISOString()
        });
      }

      if (requiredRoles && !requiredRoles.includes(validation.role!)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'Insufficient permissions for this resource'
          },
          timestamp: new Date().toISOString()
        });
      }

      req.user = {
        userId: validation.userId,
        role: validation.role
      };

      next();
    };
  }
}