import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { EncryptionUtils } from '../utils/encryption';

/**
 * Security middleware collection for protecting API endpoints
 */
export class SecurityMiddleware {
  /**
   * Enhanced Helmet configuration for security headers
   */
  static helmet() {
    return helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", "wss:", "ws:"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: []
        }
      },

      // HTTP Strict Transport Security
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },

      // X-Frame-Options
      frameguard: {
        action: 'deny'
      },

      // X-Content-Type-Options
      noSniff: true,

      // X-XSS-Protection
      xssFilter: true,

      // Referrer Policy
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin'
      },

      // Hide X-Powered-By header
      hidePoweredBy: true,

      // DNS Prefetch Control
      dnsPrefetchControl: {
        allow: false
      }
    });
  }

  /**
   * HTTPS enforcement middleware
   */
  static enforceHTTPS() {
    return (req: Request, res: Response, next: NextFunction): void | Response => {
      // Skip in development
      if (process.env.NODE_ENV === 'development') {
        return next();
      }

      // Check if request is secure
      const isSecure = req.secure ||
        req.headers['x-forwarded-proto'] === 'https' ||
        req.headers['x-forwarded-ssl'] === 'on';

      if (!isSecure) {
        const httpsUrl = `https://${req.get('host')}${req.originalUrl}`;
        return res.redirect(301, httpsUrl);
      }

      next();
    };
  }

  /**
   * Rate limiting middleware with different tiers
   */
  static rateLimit(options: {
    windowMs?: number;
    max?: number;
    message?: string;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
  } = {}) {
    const defaultOptions = {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      ...options
    };

    return rateLimit(defaultOptions);
  }

  /**
   * Strict rate limiting for sensitive endpoints
   */
  static strictRateLimit() {
    return this.rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // limit each IP to 5 requests per windowMs
      message: 'Too many attempts. Please try again later.'
    });
  }

  /**
   * API key validation middleware
   */
  static validateApiKey(validKeys?: string[]) {
    return (req: Request, res: Response, next: NextFunction): void | Response => {
      const apiKey = req.headers['x-api-key'] as string;

      if (!apiKey) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'MISSING_API_KEY',
            message: 'API key is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Use provided keys or environment variable
      const keys = validKeys || (process.env.VALID_API_KEYS?.split(',') || []);

      if (!keys.includes(apiKey)) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid API key'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Add API key info to request for logging
      (req as any).apiKey = apiKey;
      next();
    };
  }

  /**
   * Request signature validation middleware
   */
  static validateSignature(secretKey?: string) {
    return (req: Request, res: Response, next: NextFunction): void | Response => {
      const signature = req.headers['x-signature'] as string;
      const timestamp = req.headers['x-timestamp'] as string;

      if (!signature || !timestamp) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'MISSING_SIGNATURE',
            message: 'Request signature and timestamp are required'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Check timestamp to prevent replay attacks (5 minute window)
      const requestTime = parseInt(timestamp);
      const currentTime = Date.now();
      const timeDiff = Math.abs(currentTime - requestTime);

      if (timeDiff > 5 * 60 * 1000) { // 5 minutes
        return res.status(401).json({
          success: false,
          error: {
            code: 'REQUEST_EXPIRED',
            message: 'Request timestamp is too old'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Create signature payload
      const payload = `${req.method}${req.originalUrl}${timestamp}${JSON.stringify(req.body || {})}`;

      // Verify signature
      if (!EncryptionUtils.verifySignature(payload, signature, secretKey)) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_SIGNATURE',
            message: 'Request signature is invalid'
          },
          timestamp: new Date().toISOString()
        });
      }

      next();
    };
  }

  /**
   * Input sanitization middleware
   */
  static sanitizeInput() {
    return (req: Request, res: Response, next: NextFunction): void | Response => {
      // Sanitize request body
      if (req.body && typeof req.body === 'object') {
        req.body = this.sanitizeObject(req.body);
      }

      // Sanitize query parameters
      if (req.query && typeof req.query === 'object') {
        req.query = this.sanitizeObject(req.query);
      }

      next();
    };
  }

  /**
   * Recursively sanitize object properties
   */
  private static sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return typeof obj === 'string' ? EncryptionUtils.sanitizeData(obj) : obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = this.sanitizeObject(value);
    }

    return sanitized;
  }

  /**
   * IP whitelist middleware
   */
  static ipWhitelist(allowedIPs: string[]) {
    return (req: Request, res: Response, next: NextFunction): void | Response => {
      const clientIP = req.ip ||
        req.connection.remoteAddress ||
        req.headers['x-forwarded-for'] as string ||
        req.headers['x-real-ip'] as string;

      if (!clientIP || !allowedIPs.includes(clientIP)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'IP_NOT_ALLOWED',
            message: 'Access denied from this IP address'
          },
          timestamp: new Date().toISOString()
        });
      }

      next();
    };
  }

  /**
   * Request logging middleware for security auditing
   */
  static securityLogger() {
    return (req: Request, res: Response, next: NextFunction): void | Response => {
      const startTime = Date.now();

      // Log request details
      const requestLog = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer'),
        contentLength: req.get('Content-Length'),
        userId: (req as any).user?.userId,
        apiKey: (req as any).apiKey ? EncryptionUtils.maskSensitiveData((req as any).apiKey) : undefined
      };

      // Override res.end to capture response details
      const originalEnd = res.end;
      (res as any).end = function (chunk?: any, encoding?: any) {
        const responseTime = Date.now() - startTime;

        const responseLog = {
          ...requestLog,
          statusCode: res.statusCode,
          responseTime,
          contentLength: res.get('Content-Length')
        };

        // Log security-relevant events
        if (res.statusCode >= 400) {
          console.warn('Security event:', responseLog);
        } else {
          console.log('Request:', responseLog);
        }

        return originalEnd.call(res, chunk, encoding);
      };

      next();
    };
  }

  /**
   * CORS configuration for secure cross-origin requests
   */
  static corsConfig() {
    return {
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'];

        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'X-Signature',
        'X-Timestamp'
      ],
      exposedHeaders: ['X-Total-Count', 'X-Rate-Limit-Remaining'],
      maxAge: 86400 // 24 hours
    };
  }

  /**
   * Content validation middleware
   */
  static validateContentType(allowedTypes: string[] = ['application/json']) {
    return (req: Request, res: Response, next: NextFunction): void | Response => {
      // Skip for GET requests
      if (req.method === 'GET') {
        return next();
      }

      const contentType = req.get('Content-Type');

      if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
        return res.status(415).json({
          success: false,
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: `Content-Type must be one of: ${allowedTypes.join(', ')}`
          },
          timestamp: new Date().toISOString()
        });
      }

      next();
    };
  }

  /**
   * Request size limiting middleware
   */
  static limitRequestSize(maxSize: string = '10mb') {
    return (req: Request, res: Response, next: NextFunction): void | Response => {
      const contentLength = req.get('Content-Length');

      if (contentLength) {
        const sizeInBytes = parseInt(contentLength);
        const maxSizeInBytes = this.parseSize(maxSize);

        if (sizeInBytes > maxSizeInBytes) {
          return res.status(413).json({
            success: false,
            error: {
              code: 'REQUEST_TOO_LARGE',
              message: `Request size exceeds maximum allowed size of ${maxSize}`
            },
            timestamp: new Date().toISOString()
          });
        }
      }

      next();
    };
  }

  /**
   * Parse size string to bytes
   */
  private static parseSize(size: string): number {
    const units: { [key: string]: number } = {
      'b': 1,
      'kb': 1024,
      'mb': 1024 * 1024,
      'gb': 1024 * 1024 * 1024
    };

    const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2] || 'b';

    return Math.floor(value * (units[unit] || 1));
  }
}

/**
 * Security configuration for different environments
 */
export const SecurityConfig = {
  development: {
    enforceHTTPS: false,
    strictRateLimit: false,
    requireApiKey: false,
    logLevel: 'debug'
  },

  staging: {
    enforceHTTPS: true,
    strictRateLimit: true,
    requireApiKey: true,
    logLevel: 'info'
  },

  production: {
    enforceHTTPS: true,
    strictRateLimit: true,
    requireApiKey: true,
    logLevel: 'warn'
  }
};

/**
 * Get security configuration for current environment
 */
export function getSecurityConfig() {
  const env = process.env.NODE_ENV || 'development';
  return SecurityConfig[env as keyof typeof SecurityConfig] || SecurityConfig.development;
}