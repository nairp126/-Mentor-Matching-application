import { Router } from 'express';
import { adminAuthMiddleware, requireAdminPermission } from '../middleware/adminAuth';
import { AuditController } from '../controllers/auditController';

const router = Router();
const auditController = new AuditController();

// Apply admin authentication to all routes
router.use(adminAuthMiddleware);

// Audit log retrieval
router.get('/logs',
  requireAdminPermission('admin:audit:read'),
  auditController.getAuditLogs
);

router.get('/logs/:logId',
  requireAdminPermission('admin:audit:read'),
  auditController.getAuditLogById
);

// Admin action logs
router.get('/admin-actions',
  requireAdminPermission('admin:audit:read'),
  auditController.getAdminActionLogs
);

router.get('/admin-actions/:adminId',
  requireAdminPermission('admin:audit:read'),
  auditController.getAdminActionsByUser
);

// User activity logs
router.get('/user-activity',
  requireAdminPermission('admin:audit:read'),
  auditController.getUserActivityLogs
);

router.get('/user-activity/:userId',
  requireAdminPermission('admin:audit:read'),
  auditController.getUserActivityById
);

// Security event logs
router.get('/security-events',
  requireAdminPermission('admin:audit:read'),
  auditController.getSecurityEventLogs
);

router.get('/security-events/failed-logins',
  requireAdminPermission('admin:audit:read'),
  auditController.getFailedLoginAttempts
);

router.get('/security-events/suspicious',
  requireAdminPermission('admin:audit:read'),
  auditController.getSuspiciousActivity
);

// System event logs
router.get('/system-events',
  requireAdminPermission('admin:audit:read'),
  auditController.getSystemEventLogs
);

router.get('/system-events/errors',
  requireAdminPermission('admin:audit:read'),
  auditController.getSystemErrors
);

// Data access logs
router.get('/data-access',
  requireAdminPermission('admin:audit:read'),
  auditController.getDataAccessLogs
);

router.get('/data-access/sensitive',
  requireAdminPermission('admin:audit:read'),
  auditController.getSensitiveDataAccess
);

// Audit search and filtering
router.post('/search',
  requireAdminPermission('admin:audit:read'),
  auditController.searchAuditLogs
);

// Audit statistics and reports
router.get('/stats/overview',
  requireAdminPermission('admin:audit:read'),
  auditController.getAuditStats
);

router.get('/stats/trends',
  requireAdminPermission('admin:audit:read'),
  auditController.getAuditTrends
);

// Compliance reports
router.get('/compliance/gdpr',
  requireAdminPermission('admin:audit:read'),
  auditController.getGDPRComplianceReport
);

router.get('/compliance/data-retention',
  requireAdminPermission('admin:audit:read'),
  auditController.getDataRetentionReport
);

// Export audit data
router.post('/export',
  requireAdminPermission('admin:audit:read'),
  auditController.exportAuditData
);

export { router as auditRoutes };