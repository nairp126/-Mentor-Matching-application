import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { NotificationService } from './services/notificationService';
import { InAppService } from './services/inAppService';
import { SchedulerService } from './services/schedulerService';
import { SessionReminderService } from './services/sessionReminderService';
import { FailureHandlingService } from './services/failureHandlingService';
import { createNotificationRoutes } from './routes/notifications';
import { createSessionReminderRoutes } from './routes/sessionReminders';
import { createFailureHandlingRoutes } from './routes/failureHandling';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3006;

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
const notificationService = new NotificationService(db, redis);
const inAppService = new InAppService(redis);
const schedulerService = new SchedulerService(db, redis, notificationService);
const sessionReminderService = new SessionReminderService(db, redis, notificationService);
const failureHandlingService = new FailureHandlingService(db, redis, notificationService);

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
        service: 'notification-service',
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
app.use('/api/notifications', createNotificationRoutes(
  db,
  redis,
  notificationService,
  inAppService,
  schedulerService
));

app.use('/api/session-reminders', createSessionReminderRoutes(
  db,
  redis,
  sessionReminderService
));

app.use('/api/failure-handling', createFailureHandlingRoutes(
  db,
  redis,
  failureHandlingService
));

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log(`Notification service running on port ${PORT}`);
  
  // Start the scheduler
  schedulerService.start();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Stop the scheduler
  schedulerService.stop();
  
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
  
  // Stop the scheduler
  schedulerService.stop();
  
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