import { Router } from 'express';
import { adminAuthMiddleware, requireAdminPermission, auditAdminAction } from '../middleware/adminAuth';
import { UserManagementController } from '../controllers/userManagementController';

const router = Router();
const userController = new UserManagementController();

// Apply admin authentication to all routes
router.use(adminAuthMiddleware);

// User listing and search
router.get('/',
  requireAdminPermission('admin:users:read'),
  userController.getUsers
);

router.get('/search',
  requireAdminPermission('admin:users:read'),
  userController.searchUsers
);

// Individual user management
router.get('/:userId',
  requireAdminPermission('admin:users:read'),
  userController.getUserById
);

router.put('/:userId',
  requireAdminPermission('admin:users:write'),
  auditAdminAction('UPDATE_USER'),
  userController.updateUser
);

router.delete('/:userId',
  requireAdminPermission('admin:users:delete'),
  auditAdminAction('DELETE_USER'),
  userController.deleteUser
);

// User status management
router.post('/:userId/suspend',
  requireAdminPermission('admin:users:suspend'),
  auditAdminAction('SUSPEND_USER'),
  userController.suspendUser
);

router.post('/:userId/activate',
  requireAdminPermission('admin:users:activate'),
  auditAdminAction('ACTIVATE_USER'),
  userController.activateUser
);

router.post('/:userId/reset-password',
  requireAdminPermission('admin:users:write'),
  auditAdminAction('RESET_USER_PASSWORD'),
  userController.resetUserPassword
);

// User activity and analytics
router.get('/:userId/activity',
  requireAdminPermission('admin:users:read'),
  userController.getUserActivity
);

router.get('/:userId/sessions',
  requireAdminPermission('admin:sessions:read'),
  userController.getUserSessions
);

router.get('/:userId/messages',
  requireAdminPermission('admin:users:read'),
  userController.getUserMessages
);

// Bulk user operations
router.post('/bulk/suspend',
  requireAdminPermission('admin:users:suspend'),
  auditAdminAction('BULK_SUSPEND_USERS'),
  userController.bulkSuspendUsers
);

router.post('/bulk/activate',
  requireAdminPermission('admin:users:activate'),
  auditAdminAction('BULK_ACTIVATE_USERS'),
  userController.bulkActivateUsers
);

router.post('/bulk/notify',
  requireAdminPermission('admin:notifications:send'),
  auditAdminAction('BULK_NOTIFY_USERS'),
  userController.bulkNotifyUsers
);

// User statistics
router.get('/stats/overview',
  requireAdminPermission('admin:users:read'),
  userController.getUserStats
);

router.get('/stats/growth',
  requireAdminPermission('admin:users:read'),
  userController.getUserGrowthStats
);

router.get('/stats/engagement',
  requireAdminPermission('admin:users:read'),
  userController.getUserEngagementStats
);

export { router as userManagementRoutes };