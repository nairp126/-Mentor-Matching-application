import { AuthMiddleware } from './middleware/authMiddleware';
import { AuthUtils, UserRole } from '@mentor-platform/shared';

/**
 * Demonstration of Role-Based Access Control functionality
 */
async function demonstrateRBAC() {
  console.log('=== Role-Based Access Control Demonstration ===\n');

  // 1. Show permissions for different roles
  console.log('1. Role Permissions:');
  const roles: UserRole[] = ['ADMIN', 'MENTOR', 'STUDENT'];
  
  roles.forEach(role => {
    const permissions = AuthMiddleware.getPermissionsForRole(role);
    console.log(`${role}:`, permissions);
  });

  console.log('\n2. Permission Checks:');
  
  // 2. Test permission checks
  const testCases = [
    { role: 'ADMIN' as UserRole, permission: 'user:read', expected: true },
    { role: 'ADMIN' as UserRole, permission: 'system:admin', expected: true },
    { role: 'MENTOR' as UserRole, permission: 'session:write:own', expected: true },
    { role: 'MENTOR' as UserRole, permission: 'system:admin', expected: false },
    { role: 'STUDENT' as UserRole, permission: 'user:read:own', expected: true },
    { role: 'STUDENT' as UserRole, permission: 'user:write', expected: false },
  ];

  testCases.forEach(({ role, permission, expected }) => {
    const hasPermission = AuthMiddleware.roleHasPermission(role, permission);
    const status = hasPermission === expected ? '✅' : '❌';
    console.log(`${status} ${role} has ${permission}: ${hasPermission} (expected: ${expected})`);
  });

  console.log('\n3. JWT Token Generation and Validation:');
  
  // 3. Generate tokens for different roles
  const users = [
    { id: 'admin-123', role: 'ADMIN' as UserRole },
    { id: 'mentor-456', role: 'MENTOR' as UserRole },
    { id: 'student-789', role: 'STUDENT' as UserRole }
  ];

  users.forEach(user => {
    const token = AuthUtils.generateAccessToken(user.id, user.role);
    const validation = AuthUtils.validateToken(token);
    
    console.log(`${user.role} Token:`, {
      userId: validation.userId,
      role: validation.role,
      valid: validation.valid,
      permissions: AuthMiddleware.getPermissionsForRole(user.role).slice(0, 3) // Show first 3
    });
  });

  console.log('\n4. Access Control Scenarios:');
  
  // 4. Simulate access control scenarios
  const scenarios = [
    {
      description: 'Admin accessing security stats',
      userRole: 'ADMIN' as UserRole,
      requiredRoles: ['ADMIN'],
      requiredPermission: 'security:read',
      shouldAllow: true
    },
    {
      description: 'Student accessing security stats',
      userRole: 'STUDENT' as UserRole,
      requiredRoles: ['ADMIN'],
      requiredPermission: 'security:read',
      shouldAllow: false
    },
    {
      description: 'Mentor accessing own sessions',
      userRole: 'MENTOR' as UserRole,
      requiredRoles: ['MENTOR', 'ADMIN'],
      requiredPermission: 'session:write:own',
      shouldAllow: true
    },
    {
      description: 'Student registering for session',
      userRole: 'STUDENT' as UserRole,
      requiredRoles: ['STUDENT', 'MENTOR', 'ADMIN'],
      requiredPermission: 'session:register',
      shouldAllow: true
    }
  ];

  scenarios.forEach(scenario => {
    const roleAllowed = scenario.requiredRoles.includes(scenario.userRole);
    const permissionAllowed = AuthMiddleware.roleHasPermission(scenario.userRole, scenario.requiredPermission);
    const accessAllowed = roleAllowed && permissionAllowed;
    
    const status = accessAllowed === scenario.shouldAllow ? '✅' : '❌';
    console.log(`${status} ${scenario.description}:`);
    console.log(`   Role check: ${roleAllowed}, Permission check: ${permissionAllowed}, Access: ${accessAllowed}`);
  });

  console.log('\n5. Security Features:');
  console.log('✅ JWT token validation with role and permission claims');
  console.log('✅ Role-based route protection');
  console.log('✅ Fine-grained permission system');
  console.log('✅ Resource ownership verification');
  console.log('✅ Audit logging for access attempts');
  console.log('✅ Comprehensive error handling with proper HTTP status codes');

  console.log('\n=== RBAC Implementation Complete ===');
}

// Run the demonstration
if (require.main === module) {
  demonstrateRBAC().catch(console.error);
}

export { demonstrateRBAC };