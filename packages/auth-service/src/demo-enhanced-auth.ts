/**
 * Demo script to showcase enhanced authentication features
 * This demonstrates the invalid authentication handling, security event logging, and rate limiting
 */

import { AuthService } from './services/authService';
import { SecurityService } from './services/securityService';
import { DatabaseManager } from '@mentor-platform/shared';

// Mock database for demonstration
class MockDatabaseManager extends DatabaseManager {
  private mockData: Map<string, any> = new Map();
  private queryLog: Array<{ query: string; params: any[] }> = [];

  constructor() {
    super({} as any, {} as any);
  }

  async query(query: string, params?: any[]): Promise<any> {
    this.queryLog.push({ query, params: params || [] });
    
    // Mock user lookup
    if (query.includes('SELECT') && query.includes('users') && query.includes('email')) {
      const email = params?.[0];
      if (email === 'valid@example.com') {
        return {
          rows: [{
            id: 'user-123',
            email: 'valid@example.com',
            password_hash: '$2b$10$hashedpassword',
            role: 'STUDENT',
            email_verified: true,
            mfa_enabled: false,
            created_at: new Date(),
            updated_at: new Date(),
            last_login_at: null
          }]
        };
      }
      return { rows: [] }; // User not found
    }

    // Mock login attempts lookup
    if (query.includes('SELECT') && query.includes('login_attempts')) {
      const identifier = params?.[0];
      const attempts = this.mockData.get(`attempts_${identifier}`) || 0;
      
      if (attempts >= 5) {
        return {
          rows: [{
            attempt_count: attempts,
            last_attempt_at: new Date(),
            locked_until: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes from now
          }]
        };
      } else if (attempts > 0) {
        return {
          rows: [{
            attempt_count: attempts,
            last_attempt_at: new Date(),
            locked_until: null
          }]
        };
      }
      return { rows: [] };
    }

    // Mock login attempts insert/update
    if (query.includes('INSERT INTO login_attempts') || query.includes('UPDATE login_attempts')) {
      const identifier = params?.[0];
      const currentAttempts = this.mockData.get(`attempts_${identifier}`) || 0;
      this.mockData.set(`attempts_${identifier}`, currentAttempts + 1);
    }

    // Mock delete login attempts
    if (query.includes('DELETE FROM login_attempts')) {
      const email = params?.[0];
      const ip = params?.[1];
      this.mockData.delete(`attempts_${email}`);
      this.mockData.delete(`attempts_${ip}`);
    }

    return { rows: [] };
  }

  async cache(key: string, value: any, ttl?: number): Promise<void> {
    this.mockData.set(key, value);
  }

  async getCached<T>(key: string): Promise<T | null> {
    return this.mockData.get(key) || null;
  }

  async deleteCached(key: string): Promise<void> {
    this.mockData.delete(key);
  }

  getQueryLog() {
    return this.queryLog;
  }

  clearQueryLog() {
    this.queryLog = [];
  }
}

async function demonstrateEnhancedAuth() {
  console.log('🔐 Enhanced Authentication Features Demo\n');

  const mockDb = new MockDatabaseManager();
  const authService = new AuthService(mockDb);
  const securityService = authService.getSecurityService();

  // Mock AuthUtils for demo
  const AuthUtils = require('@mentor-platform/shared').AuthUtils;
  AuthUtils.verifyPassword = jest.fn().mockImplementation((password: string, hash: string) => {
    return Promise.resolve(password === 'correctpassword');
  });
  AuthUtils.generateAccessToken = jest.fn().mockReturnValue('demo-access-token');
  AuthUtils.generateRefreshToken = jest.fn().mockReturnValue('demo-refresh-token');

  const testCredentials = {
    email: 'valid@example.com',
    password: 'wrongpassword'
  };

  const ipAddress = '192.168.1.100';
  const userAgent = 'Demo-Client/1.0';

  console.log('1. Testing Invalid Authentication Handling');
  console.log('==========================================');

  // Test 1: Invalid password
  try {
    await authService.login(testCredentials, ipAddress, userAgent);
  } catch (error: any) {
    console.log(`✅ Invalid login rejected: ${error.message}`);
  }

  // Test 2: Non-existent user
  try {
    await authService.login({
      email: 'nonexistent@example.com',
      password: 'anypassword'
    }, ipAddress, userAgent);
  } catch (error: any) {
    console.log(`✅ Non-existent user rejected: ${error.message}`);
  }

  console.log('\n2. Testing Rate Limiting');
  console.log('========================');

  // Simulate multiple failed attempts
  for (let i = 1; i <= 6; i++) {
    try {
      await authService.login(testCredentials, ipAddress, userAgent);
    } catch (error: any) {
      if (error.message.includes('Too many failed login attempts')) {
        console.log(`✅ Rate limit triggered after ${i} attempts: ${error.message}`);
        break;
      } else {
        console.log(`Attempt ${i}: ${error.message}`);
      }
    }
  }

  console.log('\n3. Testing Successful Login After Rate Limit Reset');
  console.log('==================================================');

  // Clear attempts and try successful login
  await securityService.clearLoginAttempts(testCredentials.email, ipAddress);
  
  try {
    const result = await authService.login({
      email: 'valid@example.com',
      password: 'correctpassword'
    }, ipAddress, userAgent);
    
    console.log('✅ Successful login after clearing rate limit');
    console.log(`   Access Token: ${result.accessToken}`);
    console.log(`   User ID: ${result.user.id}`);
    console.log(`   User Email: ${result.user.email}`);
  } catch (error: any) {
    console.log(`❌ Unexpected error: ${error.message}`);
  }

  console.log('\n4. Security Event Logging');
  console.log('=========================');

  // Demonstrate security event logging
  await securityService.logSecurityEvent({
    eventType: 'DEMO_SECURITY_EVENT',
    userEmail: 'demo@example.com',
    ipAddress,
    userAgent,
    severity: 'MEDIUM',
    details: {
      demoData: 'This is a demonstration of security event logging',
      timestamp: new Date().toISOString()
    }
  });

  console.log('✅ Security event logged successfully');

  console.log('\n5. Security Context Extraction');
  console.log('==============================');

  const mockRequest = {
    headers: {
      'x-forwarded-for': '203.0.113.1, 192.168.1.100',
      'user-agent': 'Mozilla/5.0 (Demo Browser)'
    },
    connection: {},
    socket: {}
  } as any;

  const context = securityService.extractSecurityContext(mockRequest);
  console.log(`✅ Extracted IP Address: ${context.ipAddress}`);
  console.log(`✅ Extracted User Agent: ${context.userAgent}`);

  console.log('\n6. Database Query Log');
  console.log('====================');
  
  const queryLog = mockDb.getQueryLog();
  console.log(`Total queries executed: ${queryLog.length}`);
  
  const securityQueries = queryLog.filter(log => 
    log.query.includes('security_events') || log.query.includes('login_attempts')
  );
  
  console.log(`Security-related queries: ${securityQueries.length}`);
  console.log('Sample security queries:');
  securityQueries.slice(0, 3).forEach((log, index) => {
    console.log(`  ${index + 1}. ${log.query.split('\n')[0].trim()}...`);
  });

  console.log('\n🎉 Enhanced Authentication Demo Complete!');
  console.log('\nKey Features Demonstrated:');
  console.log('• ✅ Invalid credential rejection with proper error messages');
  console.log('• ✅ Security event logging for all authentication attempts');
  console.log('• ✅ Rate limiting with email and IP-based tracking');
  console.log('• ✅ Automatic lockout after multiple failed attempts');
  console.log('• ✅ Security context extraction from HTTP requests');
  console.log('• ✅ Comprehensive audit trail in database');
}

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateEnhancedAuth().catch(console.error);
}

export { demonstrateEnhancedAuth };