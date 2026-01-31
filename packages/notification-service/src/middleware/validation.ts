import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ApiResponse } from '@mentor-platform/shared';

export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details
        },
        timestamp: new Date().toISOString()
      } as ApiResponse);
    }

    next();
  };
};