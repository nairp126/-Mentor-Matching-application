import { Router } from 'express';
import { adminAuthMiddleware, requireAdminPermission, auditAdminAction, adminRateLimit } from '../middleware/adminAuth';
import { AdminController } from '../controllers/adminController';

const router = Router();
const adminController = new AdminController();

// Apply admin authentication to all routes
router.use(adminAuthMiddleware);
router.use(adminRateLimit(200, 60000)); // 200 requests per minute for admin

// Admin dashboard overview
router.get('/dashboard',
  requireAdminPermission('admin:dashboard'),
  auditAdminAction('VIEW_ADMIN_DASHBOARD'),
  adminController.getDashboardOverview
);

// Admin profile and settings
router.get('/profile',
  requireAdminPermission('admin:dashboard'),
  adminController.getAdminProfile
);

router.put('/profile',
  requireAdminPermission('admin:dashboard'),
  auditAdminAction('UPDATE_ADMIN_PROFILE'),
  adminController.updateAdminProfile
);

// System status and health
router.get('/system/status',
  requireAdminPermission('admin:system:read'),
  adminController.getSystemStatus
);

router.get('/system/health',
  requireAdminPermission('admin:system:read'),
  adminController.getSystemHealth
);

// Configuration management
router.get('/config',
  requireAdminPermission('admin:system:read'),
  adminController.getSystemConfig
);

router.put('/config',
  requireAdminPermission('admin:system:write'),
  auditAdminAction('UPDATE_SYSTEM_CONFIG'),
  adminController.updateSystemConfig
);

// Bulk operations
router.post('/bulk/notifications',
  requireAdminPermission('admin:notifications:send'),
  auditAdminAction('SEND_BULK_NOTIFICATIONS'),
  adminController.sendBulkNotifications
);

router.post('/bulk/export',
  requireAdminPermission('admin:reports:generate'),
  auditAdminAction('EXPORT_DATA'),
  adminController.exportData
);

export { router as adminRoutes };