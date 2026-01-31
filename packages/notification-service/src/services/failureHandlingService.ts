import { Pool } from 'pg';
import Redis from 'ioredis';
import { NotificationService, Notification } from './notificationService';
import { NotificationPriority } from '@mentor-platform/shared';

export interface FailureAnalysis {
  notificationId: string;
  failureType: 'TEMPORARY' | 'PERMANENT' | 'RATE_LIMITED' | 'CONFIGURATION';
  retryable: boolean;
  nextRetryAt?: Date;
  escalationRequired: boolean;
  failureReason: string;
}

export interface RetryStrategy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterEnabled: boolean;
}

export class FailureHandlingService {
  private db: Pool;
  private redis: Redis;
  private notificationService: NotificationService;

  // Default retry strategies by priority
  private retryStrategies: Record<NotificationPriority, RetryStrategy> = {
    URGENT: {
      maxAttempts: 5,
      baseDelayMs: 1000, // 1 second
      maxDelayMs: 300000, // 5 minutes
      backoffMultiplier: 2,
      jitterEnabled: true
    },
    HIGH: {
      maxAttempts: 4,
      baseDelayMs: 2000, // 2 seconds
      maxDelayMs: 600000, // 10 minutes
      backoffMultiplier: 2,
      jitterEnabled: true
    },
    MEDIUM: {
      maxAttempts: 3,
      baseDelayMs: 5000, // 5 seconds
      maxDelayMs: 900000, // 15 minutes
      backoffMultiplier: 2,
      jitterEnabled: true
    },
    LOW: {
      maxAttempts: 2,
      baseDelayMs: 10000, // 10 seconds
      maxDelayMs: 1800000, // 30 minutes
      backoffMultiplier: 2,
      jitterEnabled: true
    }
  };

  constructor(db: Pool, redis: Redis, notificationService: NotificationService) {
    this.db = db;
    this.redis = redis;
    this.notificationService = notificationService;
  }

  /**
   * Analyze notification failure and determine retry strategy
   */
  async analyzeFailure(notificationId: string, error: Error): Promise<FailureAnalysis> {
    const notification = await this.getNotification(notificationId);
    if (!notification) {
      throw new Error(`Notification ${notificationId} not found`);
    }

    const failureType = this.classifyFailure(error);
    const retryable = this.isRetryable(failureType, notification.attempts, notification.priority);
    
    let nextRetryAt: Date | undefined;
    if (retryable) {
      nextRetryAt = this.calculateNextRetryTime(notification.priority, notification.attempts);
    }

    const escalationRequired = this.shouldEscalate(notification, failureType);

    return {
      notificationId,
      failureType,
      retryable,
      nextRetryAt,
      escalationRequired,
      failureReason: error.message
    };
  }

  /**
   * Process failed notifications with intelligent retry logic
   */
  async processFailedNotifications(): Promise<{
    processed: number;
    retried: number;
    escalated: number;
    abandoned: number;
  }> {
    const failedNotifications = await this.getFailedNotifications();
    
    let processed = 0;
    let retried = 0;
    let escalated = 0;
    let abandoned = 0;

    for (const notification of failedNotifications) {
      try {
        const analysis = await this.analyzeFailure(
          notification.id,
          new Error(notification.failureReason || 'Unknown error')
        );

        if (analysis.escalationRequired) {
          await this.escalateNotification(notification, analysis);
          escalated++;
        } else if (analysis.retryable && analysis.nextRetryAt) {
          await this.scheduleRetry(notification, analysis.nextRetryAt);
          retried++;
        } else {
          await this.abandonNotification(notification, analysis);
          abandoned++;
        }

        processed++;
      } catch (error) {
        console.error(`Error processing failed notification ${notification.id}:`, error);
      }
    }

    return { processed, retried, escalated, abandoned };
  }

  /**
   * Handle rate limiting scenarios
   */
  async handleRateLimit(
    notificationId: string,
    channel: string,
    retryAfterSeconds: number
  ): Promise<void> {
    const notification = await this.getNotification(notificationId);
    if (!notification) {
      return;
    }

    // Calculate retry time based on rate limit
    const retryAt = new Date(Date.now() + retryAfterSeconds * 1000);

    // Store rate limit information
    await this.redis.setex(
      `rate_limit:${channel}`,
      retryAfterSeconds,
      JSON.stringify({
        retryAfter: retryAt.toISOString(),
        affectedNotifications: [notificationId]
      })
    );

    // Schedule retry after rate limit expires
    await this.scheduleRetry(notification, retryAt);

    // Log rate limit event
    await this.logFailureEvent(notificationId, 'RATE_LIMITED', {
      channel,
      retryAfterSeconds,
      retryAt: retryAt.toISOString()
    });
  }

  /**
   * Implement circuit breaker pattern for external services
   */
  async checkCircuitBreaker(service: string): Promise<{
    isOpen: boolean;
    failureCount: number;
    lastFailureAt?: Date;
    nextRetryAt?: Date;
  }> {
    const key = `circuit_breaker:${service}`;
    const data = await this.redis.get(key);

    if (!data) {
      return { isOpen: false, failureCount: 0 };
    }

    const circuitData = JSON.parse(data);
    const now = new Date();
    const lastFailureAt = new Date(circuitData.lastFailureAt);
    const timeSinceLastFailure = now.getTime() - lastFailureAt.getTime();

    // Circuit breaker thresholds
    const failureThreshold = 5;
    const openDurationMs = 5 * 60 * 1000; // 5 minutes

    const isOpen = circuitData.failureCount >= failureThreshold && 
                   timeSinceLastFailure < openDurationMs;

    let nextRetryAt: Date | undefined;
    if (isOpen) {
      nextRetryAt = new Date(lastFailureAt.getTime() + openDurationMs);
    }

    return {
      isOpen,
      failureCount: circuitData.failureCount,
      lastFailureAt,
      nextRetryAt
    };
  }

  /**
   * Record service failure for circuit breaker
   */
  async recordServiceFailure(service: string): Promise<void> {
    const key = `circuit_breaker:${service}`;
    const data = await this.redis.get(key);
    
    let circuitData = { failureCount: 0, lastFailureAt: new Date().toISOString() };
    if (data) {
      circuitData = JSON.parse(data);
      circuitData.failureCount++;
      circuitData.lastFailureAt = new Date().toISOString();
    } else {
      circuitData.failureCount = 1;
    }

    // Store with 1 hour expiration
    await this.redis.setex(key, 3600, JSON.stringify(circuitData));
  }

  /**
   * Reset circuit breaker on successful operation
   */
  async resetCircuitBreaker(service: string): Promise<void> {
    const key = `circuit_breaker:${service}`;
    await this.redis.del(key);
  }

  /**
   * Get failure statistics
   */
  async getFailureStats(timeRangeHours: number = 24): Promise<{
    totalFailures: number;
    failuresByType: Record<string, number>;
    failuresByChannel: Record<string, number>;
    retrySuccessRate: number;
    escalationRate: number;
  }> {
    const since = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);

    const failureQuery = `
      SELECT 
        COUNT(*) as total_failures,
        metadata->>'failureType' as failure_type,
        channels,
        status
      FROM notifications
      WHERE status IN ('FAILED', 'RETRY')
        AND updated_at >= $1
      GROUP BY metadata->>'failureType', channels, status
    `;

    const result = await this.db.query(failureQuery, [since]);
    
    let totalFailures = 0;
    const failuresByType: Record<string, number> = {};
    const failuresByChannel: Record<string, number> = {};
    let retryCount = 0;
    let escalationCount = 0;

    for (const row of result.rows) {
      const count = parseInt(row.total_failures);
      totalFailures += count;

      if (row.failure_type) {
        failuresByType[row.failure_type] = (failuresByType[row.failure_type] || 0) + count;
      }

      if (row.channels) {
        const channels = Array.isArray(row.channels) ? row.channels : JSON.parse(row.channels);
        for (const channel of channels) {
          failuresByChannel[channel] = (failuresByChannel[channel] || 0) + count;
        }
      }

      if (row.status === 'RETRY') {
        retryCount += count;
      }
    }

    // Get escalation count
    const escalationQuery = `
      SELECT COUNT(*) as escalation_count
      FROM failure_escalations
      WHERE created_at >= $1
    `;

    const escalationResult = await this.db.query(escalationQuery, [since]);
    escalationCount = parseInt(escalationResult.rows[0]?.escalation_count || '0');

    const retrySuccessRate = totalFailures > 0 ? (retryCount / totalFailures) * 100 : 0;
    const escalationRate = totalFailures > 0 ? (escalationCount / totalFailures) * 100 : 0;

    return {
      totalFailures,
      failuresByType,
      failuresByChannel,
      retrySuccessRate,
      escalationRate
    };
  }

  /**
   * Clean up old failure records
   */
  async cleanupFailureRecords(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const cleanupQuery = `
      DELETE FROM failure_escalations
      WHERE created_at < $1
    `;

    const result = await this.db.query(cleanupQuery, [cutoffDate]);
    return result.rowCount || 0;
  }

  /**
   * Get notification by ID
   */
  private async getNotification(notificationId: string): Promise<Notification | null> {
    const query = `
      SELECT * FROM notifications WHERE id = $1
    `;

    const result = await this.db.query(query, [notificationId]);
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      message: row.message,
      channels: row.channels,
      priority: row.priority,
      metadata: row.metadata,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at,
      failureReason: row.failure_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Get failed notifications ready for retry
   */
  private async getFailedNotifications(): Promise<Notification[]> {
    const query = `
      SELECT * FROM notifications
      WHERE status = 'FAILED'
        AND attempts < max_attempts
        AND (scheduled_at IS NULL OR scheduled_at <= NOW())
      ORDER BY priority DESC, created_at ASC
      LIMIT 100
    `;

    const result = await this.db.query(query);
    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      message: row.message,
      channels: row.channels,
      priority: row.priority,
      metadata: row.metadata,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at,
      failureReason: row.failure_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * Classify failure type based on error
   */
  private classifyFailure(error: Error): FailureAnalysis['failureType'] {
    const message = error.message.toLowerCase();

    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'RATE_LIMITED';
    }

    if (message.includes('timeout') || message.includes('network') || message.includes('connection')) {
      return 'TEMPORARY';
    }

    if (message.includes('invalid') || message.includes('unauthorized') || message.includes('forbidden')) {
      return 'CONFIGURATION';
    }

    if (message.includes('not found') || message.includes('invalid email') || message.includes('invalid phone')) {
      return 'PERMANENT';
    }

    return 'TEMPORARY'; // Default to temporary for unknown errors
  }

  /**
   * Determine if notification should be retried
   */
  private isRetryable(
    failureType: FailureAnalysis['failureType'],
    attempts: number,
    priority: NotificationPriority
  ): boolean {
    if (failureType === 'PERMANENT') {
      return false;
    }

    const strategy = this.retryStrategies[priority];
    return attempts < strategy.maxAttempts;
  }

  /**
   * Calculate next retry time with exponential backoff and jitter
   */
  private calculateNextRetryTime(priority: NotificationPriority, attempts: number): Date {
    const strategy = this.retryStrategies[priority];
    
    let delay = Math.min(
      strategy.baseDelayMs * Math.pow(strategy.backoffMultiplier, attempts),
      strategy.maxDelayMs
    );

    // Add jitter to prevent thundering herd
    if (strategy.jitterEnabled) {
      const jitter = Math.random() * 0.1 * delay; // Up to 10% jitter
      delay += jitter;
    }

    return new Date(Date.now() + delay);
  }

  /**
   * Determine if notification should be escalated
   */
  private shouldEscalate(notification: Notification, failureType: FailureAnalysis['failureType']): boolean {
    // Escalate urgent notifications that have failed multiple times
    if (notification.priority === 'URGENT' && notification.attempts >= 3) {
      return true;
    }

    // Escalate configuration errors immediately
    if (failureType === 'CONFIGURATION') {
      return true;
    }

    // Escalate if notification has been failing for too long
    const hoursSinceCreated = (Date.now() - notification.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreated > 24) {
      return true;
    }

    return false;
  }

  /**
   * Schedule notification retry
   */
  private async scheduleRetry(notification: Notification, retryAt: Date): Promise<void> {
    const query = `
      UPDATE notifications
      SET scheduled_at = $2, status = 'PENDING', updated_at = NOW()
      WHERE id = $1
    `;

    await this.db.query(query, [notification.id, retryAt]);
  }

  /**
   * Escalate notification to administrators
   */
  private async escalateNotification(notification: Notification, analysis: FailureAnalysis): Promise<void> {
    // Store escalation record
    const escalationQuery = `
      INSERT INTO failure_escalations (
        notification_id, failure_type, failure_reason, escalated_at, created_at
      ) VALUES ($1, $2, $3, NOW(), NOW())
    `;

    await this.db.query(escalationQuery, [
      notification.id,
      analysis.failureType,
      analysis.failureReason
    ]);

    // Send alert to administrators
    // This would typically integrate with an alerting system
    console.error(`ESCALATION: Notification ${notification.id} failed with ${analysis.failureType}: ${analysis.failureReason}`);
  }

  /**
   * Abandon notification after all retry attempts
   */
  private async abandonNotification(notification: Notification, analysis: FailureAnalysis): Promise<void> {
    const query = `
      UPDATE notifications
      SET status = 'FAILED', 
          failure_reason = $2,
          updated_at = NOW()
      WHERE id = $1
    `;

    await this.db.query(query, [notification.id, `Abandoned after ${notification.attempts} attempts: ${analysis.failureReason}`]);
  }

  /**
   * Log failure event for analysis
   */
  private async logFailureEvent(
    notificationId: string,
    eventType: string,
    metadata: Record<string, any>
  ): Promise<void> {
    const query = `
      INSERT INTO failure_logs (
        notification_id, event_type, metadata, created_at
      ) VALUES ($1, $2, $3, NOW())
    `;

    await this.db.query(query, [notificationId, eventType, JSON.stringify(metadata)]);
  }
}