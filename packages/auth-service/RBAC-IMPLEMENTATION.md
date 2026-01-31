# Role-Based Access Control (RBAC) Implementation

## Overview

This document describes the comprehensive Role-Based Access Control (RBAC) system implemented for the mentor matching platform's authentication service. The system provides fine-grained access control with JWT token validation, role-based permissions, and resource ownership verification.

## Architecture

### Core Components

1. **AuthMiddleware** - Main middleware class providing authentication and authorization
2. **Role Permissions** - Predefined permission sets for each user role
3. **JWT Token Validation** - Secure token verification with role and permission claims
4. **Audit Logging** - Comprehensive access attempt logging
5. **Error Handling** - Proper HTTP status codes and error responses

### User Roles

The system supports three primary user roles:

#### ADMIN
- **Purpose**: System administrators with full access
- **Permissions**:
  - `user:read`, `user:write`, `user:delete` - Full user management
  - `session:read`, `session:write`, `session:delete` - Full session management
  - `system:admin` - Administrative functions
  - `security:read` - Security event access
  - `audit:read` - Audit log access

#### MENTOR
- **Purpose**: Mentors who create and manage sessions
- **Permissions**:
  - `user:read:own`, `user:write:own` - Own profile management
  - `session:read` - View all sessions
  - `session:write:own`, `session:delete:own` - Manage own sessions
  - `message:read:own`, `message:write` - Messaging capabilities
  - `notification:read:own` - Own notifications

#### STUDENT
- **Purpose**: Students who register for sessions
- **Permissions**:
  - `user:read:own`, `user:write:own` - Own profile management
  - `session:read`, `session:register` - View and register for sessions
  - `message:read:own`, `message:write` - Messaging capabilities
  - `notification:read:own` - Own notifications

## Implementation Details

### Middleware Functions

#### 1. Authentication Middleware
```typescript
AuthMiddleware.authenticate()
```
- Validates JWT tokens from Authorization header
- Extracts user information and permissions
- Adds user context to request object

#### 2. Role-Based Authorization
```typescript
AuthMiddleware.requireRole(['ADMIN', 'MENTOR'])
```
- Restricts access to specific roles
- Supports single role or array of allowed roles
- Returns 403 Forbidden for insufficient permissions

#### 3. Permission-Based Authorization
```typescript
AuthMiddleware.requirePermission('user:write')
```
- Checks for specific permissions
- Supports wildcard permissions (e.g., `user:*`)
- Fine-grained access control

#### 4. Resource Ownership Verification
```typescript
AuthMiddleware.requireOwnership('user', 'userId')
```
- Ensures users can only access their own resources
- Admin users bypass ownership checks
- Configurable resource ID parameter

### Combined Middleware

The system provides convenient combined middleware functions:

```typescript
// Authentication + Role checking
AuthMiddleware.authenticateAndAuthorize(['ADMIN'])

// Authentication + Permission checking
AuthMiddleware.authenticateAndRequirePermission('security:read')

// Authentication + Ownership verification
AuthMiddleware.authenticateAndRequireOwnership('user')
```

## Usage Examples

### Protected Routes

#### Admin-Only Route
```typescript
router.get('/security/stats',
  ...AuthMiddleware.authenticateAndAuthorize('ADMIN'),
  ...AuthMiddleware.authenticateAndRequirePermission('security:read'),
  auditMiddleware('SECURITY_STATS_ACCESS'),
  handler
);
```

#### User Profile Access
```typescript
router.get('/me',
  ...AuthMiddleware.authenticateAndRequirePermission('user:read:own'),
  auditMiddleware('USER_PROFILE_ACCESS'),
  handler
);
```

#### Resource Ownership
```typescript
router.put('/users/:userId',
  ...AuthMiddleware.authenticateAndRequireOwnership('user', 'userId'),
  handler
);
```

### JWT Token Structure

Tokens include the following claims:
- `userId` - Unique user identifier
- `role` - User role (ADMIN, MENTOR, STUDENT)
- `type` - Token type (access/refresh)
- `exp` - Expiration timestamp

## Security Features

### 1. Token Validation
- JWT signature verification
- Expiration checking
- Token type validation
- Role and permission extraction

### 2. Access Control
- Role-based route protection
- Permission-based action control
- Resource ownership verification
- Admin privilege escalation

### 3. Audit Logging
- All access attempts logged
- User context captured
- Action and resource tracking
- IP address and user agent logging

### 4. Error Handling
- Proper HTTP status codes
- Detailed error messages
- Security event logging
- Rate limiting integration

## API Endpoints

### Authentication Endpoints
- `POST /login` - User authentication
- `POST /logout` - Session termination
- `POST /refresh` - Token refresh
- `GET /validate-token` - Token validation

### User Management (Admin Only)
- `GET /users` - List all users
- `PUT /users/:userId/role` - Update user role

### Security Endpoints
- `GET /security/stats` - Security statistics (Admin only)
- `GET /permissions` - Current user permissions

## Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "MISSING_TOKEN",
    "message": "Authorization token is required"
  },
  "timestamp": "2024-01-29T18:00:00.000Z"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "Insufficient permissions for this resource",
    "details": {
      "requiredRoles": ["ADMIN"],
      "userRole": "STUDENT"
    }
  },
  "timestamp": "2024-01-29T18:00:00.000Z"
}
```

## Testing

The implementation includes comprehensive tests:

### Unit Tests
- `authMiddleware.test.ts` - Middleware function testing
- Token validation scenarios
- Permission checking logic
- Error handling verification

### Integration Tests
- `integration.rbac.test.ts` - End-to-end RBAC testing
- Role-based access scenarios
- API endpoint protection
- Error response validation

### Demonstration
- `demo-rbac.ts` - Interactive demonstration
- Permission matrix display
- Access control scenarios
- Security feature showcase

## Configuration

### Environment Variables
- `JWT_SECRET` - JWT signing secret
- `JWT_EXPIRES_IN` - Access token expiration
- `REFRESH_TOKEN_EXPIRES_IN` - Refresh token expiration

### Permission Customization
Permissions can be modified in the `ROLE_PERMISSIONS` constant:

```typescript
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  ADMIN: ['user:*', 'session:*', 'system:admin'],
  MENTOR: ['user:read:own', 'session:write:own'],
  STUDENT: ['user:read:own', 'session:register']
};
```

## Best Practices

1. **Principle of Least Privilege** - Users have minimum required permissions
2. **Defense in Depth** - Multiple layers of security checks
3. **Audit Everything** - Comprehensive logging of access attempts
4. **Fail Securely** - Default to deny access on errors
5. **Token Security** - Short-lived access tokens with refresh mechanism

## Future Enhancements

1. **Dynamic Permissions** - Database-driven permission management
2. **Resource-Level ACLs** - Fine-grained resource permissions
3. **Time-Based Access** - Temporary permission grants
4. **Multi-Factor Authentication** - Enhanced security for sensitive operations
5. **Permission Inheritance** - Hierarchical permission structures

## Compliance

The RBAC implementation supports:
- **Requirements 1.4** - Role-based access control
- **Security best practices** - JWT validation and permission verification
- **Audit requirements** - Comprehensive access logging
- **Error handling standards** - Proper HTTP status codes and messages

This implementation provides a robust, scalable, and secure foundation for the mentor matching platform's access control needs.