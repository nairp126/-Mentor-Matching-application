import { Request, Response, NextFunction } from 'express';
import { ApiError } from '@mentor-platform/shared';

export class AppError extends Error {
  public statusCode?: number;
  public code?: string;
  public details?: Record<string, any>;

  constructor(message: string, statusCode?: number, code?: string, details?: Record<string, any>) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Auth service error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Default error response
  let statusCode = err.statusCode || 500;
  let errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
  } else if (err.code === 'RATE_LIMIT_EXCEEDED') {
    statusCode = 429;
    errorCode = 'RATE_LIMIT_EXCEEDED';
  } else if (err.code === 'INVALID_CREDENTIALS') {
    statusCode = 401;
    errorCode = 'INVALID_CREDENTIALS';
  } else if (err.code === 'EMAIL_NOT_VERIFIED') {
    statusCode = 403;
    errorCode = 'EMAIL_NOT_VERIFIED';
  } else if (err.code === 'MFA_REQUIRED') {
    statusCode = 401;
    errorCode = 'MFA_REQUIRED';
  } else if (err.code === 'INVALID_MFA_CODE') {
    statusCode = 401;
    errorCode = 'INVALID_MFA_CODE';
  } else if (err.code === 'FORBIDDEN') {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
  } else if (err.code === '23505') { // PostgreSQL unique violation
    statusCode = 409;
    errorCode = 'DUPLICATE_RESOURCE';
    message = 'Resource already exists';
  } else if (err.code === '23503') { // PostgreSQL foreign key violation
    statusCode = 400;
    errorCode = 'INVALID_REFERENCE';
    message = 'Invalid resource reference';
  }

  const errorResponse: { success: false; error: ApiError; timestamp: string } = {
    success: false,
    error: {
      code: errorCode,
      message,
      ...(err.details && { details: err.details })
    },
    timestamp: new Date().toISOString()
  };

  res.status(statusCode).json(errorResponse);
};