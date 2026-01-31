import { Router } from 'express';
import { adminAuthMiddleware, requireAdminPermission } from '../middleware/adminAuth';
import { SystemMetricsController } from '../controllers/systemMetricsController';

const router = Router();
const metricsController = new SystemMetricsController();

// Apply admin authentication to all routes
router.use(adminAuthMiddleware);

// Real-time system metrics
router.get('/realtime',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getRealtimeMetrics
);

// Performance metrics
router.get('/performance',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getPerformanceMetrics
);

router.get('/performance/api',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getApiPerformanceMetrics
);

router.get('/performance/database',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getDatabasePerformanceMetrics
);

// User activity metrics
router.get('/users/activity',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getUserActivityMetrics
);

router.get('/users/engagement',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getUserEngagementMetrics
);

router.get('/users/retention',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getUserRetentionMetrics
);

// Session metrics
router.get('/sessions/overview',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getSessionOverviewMetrics
);

router.get('/sessions/completion',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getSessionCompletionMetrics
);

router.get('/sessions/ratings',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getSessionRatingMetrics
);

// System health metrics
router.get('/health/services',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getServiceHealthMetrics
);

router.get('/health/database',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getDatabaseHealthMetrics
);

router.get('/health/cache',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getCacheHealthMetrics
);

// Error and alert metrics
router.get('/errors/overview',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getErrorMetrics
);

router.get('/errors/trends',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getErrorTrends
);

router.get('/alerts/active',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getActiveAlerts
);

// Custom metrics and reports
router.get('/custom/:metricName',
  requireAdminPermission('admin:metrics:read'),
  metricsController.getCustomMetric
);

router.post('/reports/generate',
  requireAdminPermission('admin:reports:generate'),
  metricsController.generateReport
);

router.get('/reports/:reportId',
  requireAdminPermission('admin:reports:generate'),
  metricsController.getReport
);

export { router as systemMetricsRoutes };