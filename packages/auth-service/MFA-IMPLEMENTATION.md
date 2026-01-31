# Multi-Factor Authentication (MFA) Implementation

This document describes the TOTP-based Multi-Factor Authentication implementation for the Mentor Matching Platform.

## Overview

The MFA implementation provides:
- **TOTP-based authentication** using industry-standard algorithms
- **QR code generation** for easy authenticator app setup
- **Backup codes** for account recovery
- **Secure secret storage** with proper encryption
- **Complete API endpoints** for MFA management
- **Comprehensive testing** with unit and integration tests

## Architecture

### Components

1. **MFAService** (`src/services/mfaService.ts`)
   - Core MFA logic and TOTP verification
   - Backup code generation and management
   - Secret storage and retrieval

2. **Auth Routes** (`src/routes/auth.ts`)
   - REST API endpoints for MFA operations
   - Input validation and error handling
   - Authentication middleware integration

3. **Database Schema**
   - `users.mfa_enabled`: Boolean flag for MFA status
   - `users.mfa_secret`: Encrypted TOTP secret
   - `backup_codes`: Table for backup code storage

### Dependencies

- **speakeasy**: TOTP generation and verification
- **qrcode**: QR code generation for authenticator apps
- **bcrypt**: Backup code hashing

## API Endpoints

### Setup MFA
```http
POST /mfa/setup
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCodeUrl": "data:image/png;base64,...",
    "backupCodes": ["ABC12345", "DEF67890", ...],
    "message": "MFA setup initiated. Please verify with your authenticator app to enable."
  }
}
```

### Enable MFA
```http
POST /mfa/enable
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "MFA enabled successfully"
  }
}
```

### Disable MFA
```http
POST /mfa/disable
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "MFA disabled successfully"
  }
}
```

### Check MFA Status
```http
GET /mfa/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "backupCodesRemaining": 8
  }
}
```

### Regenerate Backup Codes
```http
POST /mfa/backup-codes/regenerate
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "backupCodes": ["NEW12345", "NEW67890", ...],
    "message": "New backup codes generated successfully"
  }
}
```

## Login Flow with MFA

### Standard Login (MFA Disabled)
```http
POST /login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### MFA-Required Login
```http
POST /login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "mfaCode": "123456"
}
```

**Error Response (Missing MFA Code):**
```json
{
  "success": false,
  "error": {
    "code": "MFA_REQUIRED",
    "message": "MFA code required"
  }
}
```

## Security Features

### TOTP Configuration
- **Algorithm**: SHA-1 (RFC 6238 standard)
- **Time Step**: 30 seconds
- **Code Length**: 6 digits
- **Window**: ±2 time steps (allows for clock drift)

### Backup Codes
- **Format**: 8-character alphanumeric codes
- **Quantity**: 10 codes per user
- **Storage**: Hashed with bcrypt (cost factor 10)
- **Single Use**: Codes are marked as used after verification

### Secret Storage
- **Encoding**: Base32 (compatible with authenticator apps)
- **Length**: 32 characters (160 bits of entropy)
- **Storage**: Encrypted in database

## Database Schema

### Users Table Updates
```sql
ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN mfa_secret VARCHAR(255);
```

### Backup Codes Table
```sql
CREATE TABLE backup_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    used_at TIMESTAMP
);

CREATE INDEX idx_backup_codes_user_id ON backup_codes(user_id);
```

## Testing

### Unit Tests
- **MFAService**: Complete test coverage for all methods
- **TOTP Verification**: Mock speakeasy for consistent testing
- **Backup Codes**: Test generation, verification, and consumption
- **Error Handling**: Test all error conditions

### Integration Tests
- **API Endpoints**: Test all MFA endpoints with authentication
- **Login Flow**: Test MFA-enabled login scenarios
- **Validation**: Test input validation and error responses

### Running Tests
```bash
# Run MFA service tests
npm test -- --testPathPattern=mfaService.test.ts

# Run integration tests
npm test -- --testPathPattern=integration.mfa.test.ts

# Run all tests
npm test
```

## Usage Examples

### Setting Up MFA for a User

1. **User initiates MFA setup**
   ```javascript
   const response = await fetch('/mfa/setup', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${userToken}`,
       'Content-Type': 'application/json'
     }
   });
   const { secret, qrCodeUrl, backupCodes } = await response.json();
   ```

2. **User scans QR code with authenticator app**
   - Display `qrCodeUrl` as an image
   - User scans with Google Authenticator, Authy, etc.

3. **User enters verification code to enable MFA**
   ```javascript
   const response = await fetch('/mfa/enable', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${userToken}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({ code: '123456' })
   });
   ```

4. **Save backup codes securely**
   - Display backup codes to user
   - Instruct user to save them securely

### Logging In with MFA

```javascript
// First attempt (will fail if MFA enabled)
const loginResponse = await fetch('/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

if (loginResponse.status === 401) {
  const error = await loginResponse.json();
  if (error.error.code === 'MFA_REQUIRED') {
    // Prompt user for MFA code
    const mfaCode = prompt('Enter MFA code:');
    
    // Retry with MFA code
    const mfaResponse = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'password123',
        mfaCode: mfaCode
      })
    });
  }
}
```

## Error Handling

### Common Error Codes

- `MFA_REQUIRED`: MFA code required for login
- `INVALID_MFA_CODE`: Invalid TOTP or backup code
- `MFA_NOT_SETUP`: User attempted to enable MFA without setup
- `MFA_ALREADY_ENABLED`: User attempted to enable already-enabled MFA
- `MFA_NOT_ENABLED`: User attempted to disable non-enabled MFA
- `VALIDATION_ERROR`: Invalid input format

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "Additional context"
    }
  },
  "timestamp": "2023-12-07T10:30:00.000Z"
}
```

## Security Considerations

1. **Rate Limiting**: MFA endpoints should have strict rate limiting
2. **Audit Logging**: All MFA operations are logged for security monitoring
3. **Secret Rotation**: Consider implementing periodic secret rotation
4. **Backup Code Limits**: Limit backup code generation frequency
5. **Time Synchronization**: Ensure server time is properly synchronized

## Future Enhancements

1. **SMS/Email Backup**: Alternative MFA methods for backup
2. **Hardware Tokens**: Support for FIDO2/WebAuthn
3. **Risk-Based Authentication**: Conditional MFA based on login context
4. **Admin Override**: Emergency MFA disable for administrators
5. **Multiple Devices**: Support for multiple TOTP devices per user

## Compliance

This implementation follows:
- **RFC 6238**: TOTP standard
- **RFC 4226**: HOTP standard (base for TOTP)
- **NIST SP 800-63B**: Digital Identity Guidelines
- **OWASP**: Authentication best practices

## Demo

Run the MFA demo to see the complete workflow:

```bash
cd packages/auth-service
npm run build
node dist/demo-mfa.js
```

This will demonstrate:
- MFA setup with QR code generation
- Code verification and MFA enabling
- Login flow with MFA codes
- Backup code generation
- MFA disabling

## Support

For questions or issues with the MFA implementation:
1. Check the test files for usage examples
2. Review the API documentation above
3. Run the demo script to understand the workflow
4. Check the audit logs for debugging authentication issues