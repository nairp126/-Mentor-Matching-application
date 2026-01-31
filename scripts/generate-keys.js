#!/usr/bin/env node

/**
 * Script to generate secure encryption keys for the mentor matching platform
 * Run this script to generate production-ready keys
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('🔐 Generating secure encryption keys...\n');

// Generate encryption key (256-bit)
const encryptionKey = crypto.randomBytes(32).toString('base64');
console.log('✅ Encryption Key (256-bit):');
console.log(`ENCRYPTION_KEY=${encryptionKey}\n`);

// Generate salt (256-bit)
const salt = crypto.randomBytes(32).toString('base64');
console.log('✅ Encryption Salt (256-bit):');
console.log(`ENCRYPTION_SALT=${salt}\n`);

// Generate HMAC secret (256-bit)
const hmacSecret = crypto.randomBytes(32).toString('hex');
console.log('✅ HMAC Secret (256-bit):');
console.log(`HMAC_SECRET=${hmacSecret}\n`);

// Generate JWT secret (512-bit)
const jwtSecret = crypto.randomBytes(64).toString('base64');
console.log('✅ JWT Secret (512-bit):');
console.log(`JWT_SECRET=${jwtSecret}\n`);

// Generate API keys
const apiKeys = [];
for (let i = 1; i <= 3; i++) {
  const apiKey = crypto.randomBytes(32).toString('hex');
  apiKeys.push(apiKey);
}
console.log('✅ API Keys:');
console.log(`VALID_API_KEYS=${apiKeys.join(',')}\n`);

// Generate session secret
const sessionSecret = crypto.randomBytes(32).toString('base64');
console.log('✅ Session Secret:');
console.log(`SESSION_SECRET=${sessionSecret}\n`);

// Create .env.production template
const envTemplate = `# Production Environment Configuration
# Generated on ${new Date().toISOString()}

# Database Configuration
DATABASE_URL=postgresql://username:password@host:5432/database
REDIS_URL=redis://host:6379
ELASTICSEARCH_URL=http://host:9200

# JWT Configuration
JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d

# Encryption Configuration
ENCRYPTION_KEY=${encryptionKey}
ENCRYPTION_SALT=${salt}
HMAC_SECRET=${hmacSecret}

# Session Configuration
SESSION_SECRET=${sessionSecret}

# Service URLs (update with your production URLs)
AUTH_SERVICE_URL=https://auth.yourdomain.com
USER_SERVICE_URL=https://user.yourdomain.com
SESSION_SERVICE_URL=https://session.yourdomain.com
MATCHING_SERVICE_URL=https://matching.yourdomain.com
COMMUNICATION_SERVICE_URL=https://communication.yourdomain.com
NOTIFICATION_SERVICE_URL=https://notification.yourdomain.com
ADMIN_SERVICE_URL=https://admin.yourdomain.com

# API Security
VALID_API_KEYS=${apiKeys.join(',')}

# CORS Configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# File Storage
FILE_STORAGE_PATH=/app/uploads
MAX_FILE_SIZE=10485760

# Email Service
EMAIL_SERVICE_API_KEY=your-production-email-api-key
EMAIL_FROM_ADDRESS=noreply@yourdomain.com

# SMS Service
SMS_SERVICE_API_KEY=your-production-sms-api-key

# External Services
VIDEO_CALL_SERVICE_API_KEY=your-production-video-api-key

# Production Settings
NODE_ENV=production
LOG_LEVEL=warn
`;

// Write to .env.production file
const envPath = path.join(__dirname, '..', '.env.production');
fs.writeFileSync(envPath, envTemplate);

console.log('📄 Created .env.production template file');
console.log('⚠️  Remember to:');
console.log('   1. Update database and service URLs');
console.log('   2. Add real API keys for external services');
console.log('   3. Keep these keys secure and never commit them to version control');
console.log('   4. Use environment-specific key management in production\n');

console.log('🔒 Security Recommendations:');
console.log('   • Store keys in secure environment variable management systems');
console.log('   • Rotate keys regularly (every 90 days recommended)');
console.log('   • Use different keys for each environment (dev, staging, prod)');
console.log('   • Monitor key usage and access logs');
console.log('   • Implement key rotation procedures\n');

console.log('✨ Key generation complete!');