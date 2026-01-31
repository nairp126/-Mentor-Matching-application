import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Default error response
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal server error';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
  }

  if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
  }

  if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // PostgreSQL errors
  if (error.name === 'error' && (error as any).code) {
    const pgError = error as any;
    
    switch (pgError.code) {
      case '23505': // Unique constraint violation
        statusCode = 409;
        message = 'Resource already exists';
        break;
      case '23503': // Foreign key constraint violation
        statusCode = 400;
        message = 'Invalid reference';
        break;
      case '23502': // Not null constraint violation
        statusCode = 400;
        message = 'Required field missing';
        break;
      case '42P01': // Undefined table
        statusCode = 500;
        message = 'Database configuration error';
        break;
      default:
        statusCode = 500;
        message = 'Database error';
    }
  }

  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal server error';
  }

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
      details: error
    })
  });
};