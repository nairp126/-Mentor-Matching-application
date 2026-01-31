import dotenv from 'dotenv';
// Load environment variables first
dotenv.config();

// Restart trigger: 1
import express from 'express';
// Force restart
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { AuthUtils, SecurityMiddleware, getSecurityConfig } from '@mentor-platform/shared';
import { setupSwagger } from './docs/swagger';
import { ApiVersioning } from './middleware/versioning';
import { ApiKeyAuth } from './middleware/apiKey';
import { ApiMonitoring } from './middleware/monitoring';
import { WebhookService } from './services/webhookService';
import { webhookRoutes } from './routes/webhooks';

const app = express();
const PORT = process.env.PORT || 3000;
const securityConfig = getSecurityConfig();

// Initialize database connection
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'mentor_platform',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

// Initialize Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
});

// Initialize services
ApiKeyAuth.initialize(db, redis);
ApiMonitoring.initialize(redis);
WebhookService.initialize(db, redis);

// Start monitoring cleanup
ApiMonitoring.startPeriodicCleanup();

// Security middleware
app.use(SecurityMiddleware.helmet());
app.use(SecurityMiddleware.enforceHTTPS());
app.use(SecurityMiddleware.securityLogger());

// CORS with secure configuration
app.use(cors(SecurityMiddleware.corsConfig()));

// API versioning
app.use(ApiVersioning.middleware() as any);

// Monitoring middleware
app.use(ApiMonitoring.requestTracking() as any);
app.use(ApiMonitoring.responseTimeMonitoring() as any);
app.use(ApiMonitoring.errorRateMonitoring() as any);
app.use(ApiMonitoring.versionUsageTracking() as any);

// Rate limiting
app.use('/api', SecurityMiddleware.rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: securityConfig.strictRateLimit ? 50 : 100
}));

// Strict rate limiting for auth endpoints (skip in development)
if (process.env.NODE_ENV !== 'development') {
  app.use('/api/auth/login', SecurityMiddleware.strictRateLimit());
  app.use('/api/auth/register', SecurityMiddleware.strictRateLimit());
  app.use('/api/auth/forgot-password', SecurityMiddleware.strictRateLimit());
}

// Content validation and sanitization
app.use(SecurityMiddleware.validateContentType(['application/json', 'multipart/form-data']));
app.use(SecurityMiddleware.limitRequestSize('10mb'));
app.use(SecurityMiddleware.sanitizeInput());

// Logging and compression
app.use(morgan('combined'));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Setup API documentation
setupSwagger(app);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    }
  });
});

// API version info endpoint
app.get('/api/version', ApiVersioning.versionInfoHandler());

// Monitoring health check
app.get('/api/monitoring/health', async (req, res) => {
  const health = await ApiMonitoring.healthCheck();
  res.status(health.status === 'healthy' ? 200 : 503).json({
    success: health.status === 'healthy',
    data: health,
    timestamp: new Date().toISOString()
  });
});

// Service endpoints configuration
const services = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  user: process.env.USER_SERVICE_URL || 'http://localhost:3002',
  session: process.env.SESSION_SERVICE_URL || 'http://localhost:3003',
  matching: process.env.MATCHING_SERVICE_URL || 'http://localhost:3004',
  communication: process.env.COMMUNICATION_SERVICE_URL || 'http://localhost:3005',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3006',
  admin: process.env.ADMIN_SERVICE_URL || 'http://localhost:3007'
};

// Authentication middleware for protected routes
const authMiddleware = AuthUtils.createAuthMiddleware();

// Webhook routes (supports both JWT and API key auth)
app.use('/api/webhooks', (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;

  if (apiKey) {
    // Use API key authentication
    ApiKeyAuth.middleware(['webhooks:read', 'webhooks:write'])(req, res, next);
  } else if (authHeader) {
    // Use JWT authentication
    authMiddleware(req, res, next);
  } else {
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Either API key or JWT token is required'
      },
      timestamp: new Date().toISOString()
    });
  }
}, webhookRoutes);

// Public routes (no authentication required)
app.use('/api/auth', createProxyMiddleware({
  target: services.auth,
  changeOrigin: true,
  pathRewrite: {
    '^/api/auth': ''
  },
  onProxyReq: (proxyReq, req, res) => {
    // Restream parsed body
    if ((req as any).body && Object.keys((req as any).body).length > 0) {
      const bodyData = JSON.stringify((req as any).body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
  },
  onError: (err, req, res) => {
    console.error('Auth service proxy error:', err);
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Authentication service is temporarily unavailable'
      },
      timestamp: new Date().toISOString()
    });
  }
}));

// Protected routes (authentication required)
app.use('/api/users', authMiddleware, createProxyMiddleware({
  target: services.user,
  changeOrigin: true,
  pathRewrite: {
    '^/api/users': ''
  },
  onProxyReq: (proxyReq, req) => {
    // Forward user information to the service
    proxyReq.setHeader('X-User-ID', (req as any).user.userId);
    proxyReq.setHeader('X-User-Role', (req as any).user.role);
  },
  onError: (err, req, res) => {
    console.error('User service proxy error:', err);
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'User service is temporarily unavailable'
      },
      timestamp: new Date().toISOString()
    });
  }
}));

app.use('/api/sessions', authMiddleware, createProxyMiddleware({
  target: services.session,
  changeOrigin: true,
  pathRewrite: {
    '^/api/sessions': ''
  },
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('X-User-ID', (req as any).user.userId);
    proxyReq.setHeader('X-User-Role', (req as any).user.role);
  },
  onError: (err, req, res) => {
    console.error('Session service proxy error:', err);
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Session service is temporarily unavailable'
      },
      timestamp: new Date().toISOString()
    });
  }
}));

app.use('/api/matching', authMiddleware, createProxyMiddleware({
  target: services.matching,
  changeOrigin: true,
  pathRewrite: {
    '^/api/matching': ''
  },
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('X-User-ID', (req as any).user.userId);
    proxyReq.setHeader('X-User-Role', (req as any).user.role);
  },
  onError: (err, req, res) => {
    console.error('Matching service proxy error:', err);
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Matching service is temporarily unavailable'
      },
      timestamp: new Date().toISOString()
    });
  }
}));

app.use('/api/communication', authMiddleware, createProxyMiddleware({
  target: services.communication,
  changeOrigin: true,
  pathRewrite: {
    '^/api/communication': ''
  },
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('X-User-ID', (req as any).user.userId);
    proxyReq.setHeader('X-User-Role', (req as any).user.role);
  },
  onError: (err, req, res) => {
    console.error('Communication service proxy error:', err);
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Communication service is temporarily unavailable'
      },
      timestamp: new Date().toISOString()
    });
  }
}));

app.use('/api/notifications', authMiddleware, createProxyMiddleware({
  target: services.notification,
  changeOrigin: true,
  pathRewrite: {
    '^/api/notifications': ''
  },
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('X-User-ID', (req as any).user.userId);
    proxyReq.setHeader('X-User-Role', (req as any).user.role);
  },
  onError: (err, req, res) => {
    console.error('Notification service proxy error:', err);
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Notification service is temporarily unavailable'
      },
      timestamp: new Date().toISOString()
    });
  }
}));

// Admin routes (admin role required)
const adminMiddleware = AuthUtils.createAuthMiddleware(['ADMIN']);

app.use('/api/admin', adminMiddleware, createProxyMiddleware({
  target: services.admin,
  changeOrigin: true,
  pathRewrite: {
    '^/api/admin': '/api/admin'
  },
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('X-User-ID', (req as any).user.userId);
    proxyReq.setHeader('X-User-Role', (req as any).user.role);
  },
  onError: (err, req, res) => {
    console.error('Admin service proxy error:', err);
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Admin service is temporarily unavailable'
      },
      timestamp: new Date().toISOString()
    });
  }
}));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found'
    },
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Gateway error:', err);

  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred'
    },
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log('📚 API Documentation available at:');
  console.log(`   Swagger UI: http://localhost:${PORT}/api-docs`);
  console.log(`   OpenAPI JSON: http://localhost:${PORT}/api-docs.json`);
  console.log(`   OpenAPI YAML: http://localhost:${PORT}/api-docs.yaml`);
  console.log('🔧 Service endpoints:');
  Object.entries(services).forEach(([name, url]) => {
    console.log(`   ${name}: ${url}`);
  });
  console.log('📊 Monitoring endpoints:');
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   API Version: http://localhost:${PORT}/api/version`);
  console.log(`   Monitoring Health: http://localhost:${PORT}/api/monitoring/health`);
});

export default app;