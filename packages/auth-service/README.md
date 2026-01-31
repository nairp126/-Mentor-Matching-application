# Authentication Service

This service implements user authentication for the mentor matching platform, providing secure user registration, login, and session management capabilities.

## Features Implemented

### ✅ Task 2.1: Create user registration and login endpoints

- **User Registration with Email Verification**
  - Secure password hashing using bcrypt with 12 salt rounds
  - Email verification token generation and storage
  - Duplicate user prevention
  - Audit logging for registration events

- **Login Endpoint with JWT Token Generation**
  - Credential validation with secure password verification
  - JWT access token generation (1 hour expiration)
  - JWT refresh token generation (7 days expiration)
  - Session management with Redis caching
  - Security event logging for failed attempts

- **Password Hashing with bcrypt**
  - Industry-standard bcrypt hashing algorithm
  - 12 salt rounds for optimal security/performance balance
  - Unique salt generation for each password
  - Secure password verification

## API Endpoints

### Authentication Endpoints

#### `POST /register`

Register a new user account.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "role": "STUDENT"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "User registered successfully. Please check your email for verification.",
    "userId": "uuid-here"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### `POST /login`

Authenticate user and receive JWT tokens.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "mfaCode": "123456" // Optional, required if MFA is enabled
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "accessToken": "jwt-access-token",
    "refreshToken": "jwt-refresh-token",
    "expiresIn": 3600,
    "user": {
      "id": "uuid-here",
      "email": "user@example.com",
      "role": "STUDENT",
      "emailVerified": true,
      "mfaEnabled": false
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### `POST /refresh`

Refresh access token using refresh token.

**Request Body:**

```json
{
  "refreshToken": "jwt-refresh-token"
}
```

#### `POST /logout`

Logout user and invalidate refresh token.

**Headers:**

```
Authorization: Bearer <access-token>
```

#### `GET /verify-email/:token`

Verify user email address.

#### `POST /forgot-password`

Request password reset email.

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

#### `GET /me`

Get current user information.

**Headers:**

```
Authorization: Bearer <access-token>
```

## Security Features

### Password Security

- **bcrypt Hashing**: Industry-standard password hashing with 12 salt rounds
- **Unique Salts**: Each password gets a unique salt for maximum security
- **No Plain Text Storage**: Passwords are never stored in plain text

### JWT Token Security

- **Separate Token Types**: Access tokens and refresh tokens serve different purposes
- **Token Validation**: Strict validation prevents token misuse
- **Expiration Management**: Access tokens expire in 1 hour, refresh tokens in 7 days
- **Secure Storage**: Refresh tokens are stored securely in Redis

### Rate Limiting

- **Authentication Endpoints**: 5 requests per 15 minutes per IP
- **General Endpoints**: 100 requests per 15 minutes per IP
- **Configurable Limits**: Easy to adjust based on requirements

### Security Logging

- **Failed Login Attempts**: All failed login attempts are logged
- **Security Events**: Invalid credentials, MFA failures, etc.
- **Audit Trail**: Complete audit log of authentication events

## Multi-Factor Authentication (MFA)

The service supports TOTP-based multi-factor authentication:

- **MFA Secret Generation**: Secure Base32 secret generation
- **MFA Enforcement**: Required when enabled for user account
- **MFA Validation**: TOTP code verification (placeholder implementation)

## Email Integration

### Email Verification

- **Verification Tokens**: Secure UUID-based verification tokens
- **Token Expiration**: 24-hour expiration for verification tokens
- **Email Templates**: Professional HTML email templates

### Password Reset

- **Reset Tokens**: Secure UUID-based reset tokens
- **Token Expiration**: 1-hour expiration for reset tokens
- **Security**: No user enumeration through consistent responses

## Database Integration

### User Storage

- **PostgreSQL**: Primary user data storage
- **UUID Primary Keys**: Secure, non-sequential user identifiers
- **Indexed Queries**: Optimized database queries with proper indexing

### Session Management

- **Redis Caching**: Fast session and token storage
- **Automatic Expiration**: Redis TTL for automatic cleanup
- **Scalable**: Supports horizontal scaling

## Error Handling

### Comprehensive Error Management

- **Structured Errors**: Consistent error response format
- **Error Classification**: Different error types with appropriate HTTP status codes
- **Security Considerations**: No sensitive information in error messages

### Error Types

- **Validation Errors**: Input validation failures (400)
- **Authentication Errors**: Invalid credentials, expired tokens (401)
- **Authorization Errors**: Insufficient permissions (403)
- **Conflict Errors**: Duplicate resources (409)
- **Server Errors**: Internal server errors (500)

## Testing

### Test Coverage

- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end authentication flow testing
- **Requirements Tests**: Validation against specific requirements
- **Security Tests**: Password hashing, token validation, etc.

### Running Tests

```bash
npm test                    # Run all tests
npm run test:watch         # Run tests in watch mode
npx jest --coverage        # Run tests with coverage report
```

## Environment Configuration

### Required Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mentor_platform
DB_USER=postgres
DB_PASSWORD=password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d

# Email
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-password
FROM_EMAIL=noreply@mentorplatform.com

# Application
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://your-frontend.com
ALLOWED_ORIGINS=https://your-frontend.com
```

## Development

### Starting the Service

```bash
npm run dev     # Development mode with hot reload
npm start       # Production mode
npm run build   # Build TypeScript to JavaScript
```

### Health Check

The service provides a health check endpoint at `/health` for monitoring and load balancer integration.

## Requirements Satisfied

### ✅ Requirement 1.1: User Registration with Email Verification

- Users can register with valid credentials
- Email verification is sent upon registration
- Account creation is secure and audited

### ✅ Requirement 1.2: User Login with Session Management

- Users can login with valid credentials
- JWT tokens are generated for session management
- Secure session establishment and management

### ✅ Additional Security Requirements

- Password hashing with bcrypt
- Multi-factor authentication support
- Security event logging
- Rate limiting and error handling
- Token-based authentication with refresh capability

## Architecture Integration

This authentication service integrates with the broader mentor matching platform architecture:

- **API Gateway**: Routes authentication requests through the gateway
- **Database**: Stores user credentials and profile information
- **Redis**: Manages session tokens and caching
- **Email Service**: Handles verification and password reset emails
- **Other Services**: Provides authentication for all platform services

The service follows microservices patterns and is designed for scalability, security, and maintainability.

# Auth Service

## 1. Purpose & Responsibility

**What this module does**:
Manages the identity lifecycle of users. It handles Registration, Login, JWT Token generation (Access/Refresh), Multi-Factor Authentication (MFA), and Role-Based Access Control (RBAC) policy enforcement.

**Why it exists**:
To centralize security logic. By isolating identity management, we ensure that sensitive operations (password hashing, token signing) are contained within a single, hardened service.

## 2. Core Components & Structure

- **`index.ts`**: Service entry point. Connects to DB and Redis.
- **`routes/auth.ts`**: Defines REST endpoints (`/login`, `/register`, `/mfa/*`).
- **`services/`**:
  - `authService.ts`: Core business logic (Hash passwords, Generate Tokens).
  - `mfaService.ts` (implied): logic for TOTP generation and verification.
- **`middleware/`**:
  - `authMiddleware.ts`: RBAC enforcement logic.

## 3. Implementation Details

- **Token Strategy**: Implements Short-lived Access Tokens (1h) and Long-lived Refresh Tokens (7d) stored in Redis.
- **MFA**: Uses TOTP (Time-based One-Time Password) algorithm.
- **Security**: Heavily relies on `@mentor-platform/shared` for database connections and validation schemas. Uses `bcrypt` for password hashing logic.

## 4. Inter-Module Communication

- **Inputs**: JSON payloads with Credentials, Tokens, or MFA codes.
- **Outputs**: JSON responses with JWTs and User Profiles.
- **Dependencies**:
  - `packages/shared`: For `DatabaseManager` and Validation Schemas.
  - `PostgreSQL`: For persistent user storage.
  - `Redis`: For session/token caching.

## 5. Usage Example

**Login Flow**:

```typescript
// From a client or test script
const response = await fetch('http://localhost:3001/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'user@example.com', password: 'secure123' })
});
// Returns { token: 'jwt...', refreshToken: '...' }
```

**Service Logic**:

```typescript
import { AuthService } from './services/authService';

const authService = new AuthService(dbManager);
const result = await authService.login(credentials, ip, userAgent);
```
