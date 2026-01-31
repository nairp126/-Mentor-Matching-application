import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import cron from 'node-cron';

dotenv.config();

import { Pool } from 'pg';
import Redis from 'ioredis';
import { RatingService } from './services/ratingService';
import { RatingAnalyticsService } from './services/ratingAnalyticsService';
import { ReviewValidationService } from './services/reviewValidationService';
import { createRatingRoutes } from './routes/ratings';
import { createAnalyticsRoutes } from './routes/analytics';
import { createModerationRoutes } from './routes/moderation';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3008;

// Database connection
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'mentor_platform',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
});

// Initialize services
const ratingService = new RatingService(db, redis);
const ratingAnalyticsService = new RatingAnalyticsService(db, redis);
const reviewValidationService = new ReviewValidationService(db, redis);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later'
    },
    timestamp: new Date().toISOString()
  }
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await db.query('SELECT 1');

    // Check Redis connection
    await redis.ping();

    res.json({
      success: true,
      data: {
        service: 'rating-service',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service health check failed'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Routes
app.use('/api/ratings', createRatingRoutes(db, redis, ratingService));
app.use('/api/analytics', createAnalyticsRoutes(db, redis, ratingAnalyticsService));
app.use('/api/moderation', createModerationRoutes(db, redis, reviewValidationService));

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Scheduled tasks
// Process rating prompts every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  try {
    console.log('Processing scheduled rating prompts...');
    await ratingService.processScheduledRatingPrompts();
  } catch (error) {
    console.error('Error processing rating prompts:', error);
  }
});

// Expire old rating prompts daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  try {
    console.log('Expiring old rating prompts...');
    const expiredCount = await ratingService.expireOldRatingPrompts();
    console.log(`Expired ${expiredCount} old rating prompts`);
  } catch (error) {
    console.error('Error expiring rating prompts:', error);
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Rating service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');

  // Close server
  server.close(() => {
    console.log('HTTP server closed');

    // Close database connections
    db.end(() => {
      console.log('Database connection closed');
    });

    // Close Redis connection
    redis.disconnect();
    console.log('Redis connection closed');

    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');

  // Close server
  server.close(() => {
    console.log('HTTP server closed');

    // Close database connections
    db.end(() => {
      console.log('Database connection closed');
    });

    // Close Redis connection
    redis.disconnect();
    console.log('Redis connection closed');

    process.exit(0);
  });
});

export default app;