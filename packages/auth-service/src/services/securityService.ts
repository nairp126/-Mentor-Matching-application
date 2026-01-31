import { DatabaseManager } from '@mentor-platform/shared';
import { Request } from 'express';

export interface SecurityEvent {
  eventType: string;
  userEmail?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  lockoutTimeRemaining?: number; // in seconds
  resetTime?: Date;
}

export class SecurityService {
  private db: DatabaseManager;
  
  // Rate limiting configuration
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60; // 15 minutes in seconds
  private readonly ATTEMPT_WINDOW = 15 * 60; // 15 minutes in seconds

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      const query = `
        INSERT INTO security_events (
          event_type, user_email, user_id, ip_address, user_agent, details, severity, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `;

      await this.db.query(query, [
        event.eventType,
        event.userEmail?.toLowerCase() || null,
        event.userId || null,
        event.ipAddress || null,
        event.userAgent || null,
        event.details ? JSON.stringify(event.details) : null,
        event.severity || 'MEDIUM'
      ]);

      // Also log to console for immediate visibility
      console.warn(`Security Event [${event.severity}]: ${event.eventType}`, {
        userEmail: event.userEmail,
        userId: event.userId,
        ipAddress: event.ipAddress,
        details: event.details,
        timestamp: new Date().toISOString()
      });

      // For critical events, we might want to send alerts
      if (event.severity === 'CRITICAL') {
        await this.handleCriticalSecurityEvent(event);
      }

    } catch (error) {
      console.error('Failed to log security event:', error);
      // Don't throw error to avoid breaking the main flow
    }
  }

  /**
   * Check if login attempt is allowed based on rate limiting
   */
  async checkLoginRateLimit(email: string, ipAddress: string): Promise<RateLimitResult> {
    try {
      // Check both email-based and IP-based rate limiting
      const emailResult = await this.checkRateLimitForIdentifier(email, 'EMAIL');
      const ipResult = await this.checkRateLimitForIdentifier(ipAddress, 'IP');

      // Return the most restrictive result
      if (!emailResult.allowed || !ipResult.allowed) {
        const mostRestrictive = !emailResult.allowed ? emailResult : ipResult;
        return mostRestrictive;
      }

      return {
        allowed: true,
        remainingAttempts: Math.min(emailResult.remainingAttempts, ipResult.remainingAttempts)
      };

    } catch (error) {
      console.error('Error checking login rate limit:', error);
      // In case of error, allow the attempt but log the issue
      return { allowed: true, remainingAttempts: this.MAX_LOGIN_ATTEMPTS };
    }
  }

  /**
   * Record a failed login attempt
   */
  async recordFailedLoginAttempt(email: string, ipAddress: string): Promise<void> {
    try {
      await Promise.all([
        this.recordAttemptForIdentifier(email, 'EMAIL'),
        this.recordAttemptForIdentifier(ipAddress, 'IP')
      ]);
    } catch (error) {
      console.error('Error recording failed login attempt:', error);
    }
  }

  /**
   * Clear login attempts after successful login
   */
  async clearLoginAttempts(email: string, ipAddress: string): Promise<void> {
    try {
      const query = `
        DELETE FROM login_attempts 
        WHERE (identifier = $1 AND identifier_type = 'EMAIL') 
           OR (identifier = $2 AND identifier_type = 'IP')
      `;
      
      await this.db.query(query, [email.toLowerCase(), ipAddress]);
    } catch (error) {
      console.error('Error clearing login attempts:', error);
    }
  }

  /**
   * Get security event statistics for monitoring
   */
  async getSecurityEventStats(timeWindow: number = 24): Promise<Record<string, number>> {
    try {
      const query = `
        SELECT event_type, COUNT(*) as count
        FROM security_events 
        WHERE created_at >= NOW() - INTERVAL '${timeWindow} hours'
        GROUP BY event_type
        ORDER BY count DESC
      `;

      const result = await this.db.query(query);
      const stats: Record<string, number> = {};
      
      result.rows.forEach((row: any) => {
        stats[row.event_type] = parseInt(row.count);
      });

      return stats;
    } catch (error) {
      console.error('Error getting security event stats:', error);
      return {};
    }
  }

  /**
   * Extract security context from request
   */
  extractSecurityContext(req: Request): { ipAddress: string; userAgent: string } {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
                     (req.headers['x-real-ip'] as string) ||
                     req.connection.remoteAddress ||
                     req.socket.remoteAddress ||
                     'unknown';

    const userAgent = req.headers['user-agent'] || 'unknown';

    return { ipAddress, userAgent };
  }

  // Private helper methods

  private async checkRateLimitForIdentifier(identifier: string, type: 'EMAIL' | 'IP'): Promise<RateLimitResult> {
    const query = `
      SELECT attempt_count, last_attempt_at, locked_until
      FROM login_attempts 
      WHERE identifier = $1 AND identifier_type = $2
    `;

    const result = await this.db.query(query, [identifier.toLowerCase(), type]);

    if (result.rows.length === 0) {
      return {
        allowed: true,
        remainingAttempts: this.MAX_LOGIN_ATTEMPTS
      };
    }

    const row = result.rows[0];
    const now = new Date();
    const lastAttempt = new Date(row.last_attempt_at);
    const lockedUntil = row.locked_until ? new Date(row.locked_until) : null;

    // Check if currently locked out
    if (lockedUntil && now < lockedUntil) {
      const lockoutTimeRemaining = Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
      return {
        allowed: false,
        remainingAttempts: 0,
        lockoutTimeRemaining,
        resetTime: lockedUntil
      };
    }

    // Check if attempts should be reset (outside the window)
    const timeSinceLastAttempt = (now.getTime() - lastAttempt.getTime()) / 1000;
    if (timeSinceLastAttempt > this.ATTEMPT_WINDOW) {
      // Reset attempts
      await this.resetAttemptsForIdentifier(identifier, type);
      return {
        allowed: true,
        remainingAttempts: this.MAX_LOGIN_ATTEMPTS
      };
    }

    // Check if max attempts reached
    if (row.attempt_count >= this.MAX_LOGIN_ATTEMPTS) {
      // Lock the identifier
      const lockUntil = new Date(now.getTime() + (this.LOCKOUT_DURATION * 1000));
      await this.lockIdentifier(identifier, type, lockUntil);
      
      return {
        allowed: false,
        remainingAttempts: 0,
        lockoutTimeRemaining: this.LOCKOUT_DURATION,
        resetTime: lockUntil
      };
    }

    return {
      allowed: true,
      remainingAttempts: this.MAX_LOGIN_ATTEMPTS - row.attempt_count
    };
  }

  private async recordAttemptForIdentifier(identifier: string, type: 'EMAIL' | 'IP'): Promise<void> {
    const query = `
      INSERT INTO login_attempts (identifier, identifier_type, attempt_count, last_attempt_at)
      VALUES ($1, $2, 1, NOW())
      ON CONFLICT (identifier, identifier_type)
      DO UPDATE SET 
        attempt_count = login_attempts.attempt_count + 1,
        last_attempt_at = NOW()
    `;

    await this.db.query(query, [identifier.toLowerCase(), type]);
  }

  private async resetAttemptsForIdentifier(identifier: string, type: 'EMAIL' | 'IP'): Promise<void> {
    const query = `
      UPDATE login_attempts 
      SET attempt_count = 0, last_attempt_at = NOW(), locked_until = NULL
      WHERE identifier = $1 AND identifier_type = $2
    `;

    await this.db.query(query, [identifier.toLowerCase(), type]);
  }

  private async lockIdentifier(identifier: string, type: 'EMAIL' | 'IP', lockUntil: Date): Promise<void> {
    const query = `
      UPDATE login_attempts 
      SET locked_until = $3
      WHERE identifier = $1 AND identifier_type = $2
    `;

    await this.db.query(query, [identifier.toLowerCase(), type, lockUntil]);
  }

  private async handleCriticalSecurityEvent(event: SecurityEvent): Promise<void> {
    // In a production system, this would:
    // 1. Send alerts to security team
    // 2. Potentially trigger automated responses
    // 3. Log to external security monitoring systems
    
    console.error('CRITICAL SECURITY EVENT:', event);
    
    // For now, just ensure it's logged with high visibility
    // In production, you might integrate with services like:
    // - PagerDuty for alerting
    // - Slack/Teams for notifications
    // - SIEM systems for security monitoring
  }
}