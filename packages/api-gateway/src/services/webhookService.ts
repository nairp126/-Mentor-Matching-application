import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { Pool } from 'pg';

export interface WebhookEvent {
  id: string;
  type: string;
  data: any;
  timestamp: Date;
  version: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  lastDeliveryAt?: Date;
  failureCount: number;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  url: string;
  httpStatus?: number;
  responseTime?: number;
  attempts: number;
  success: boolean;
  errorMessage?: string;
  createdAt: Date;
  deliveredAt?: Date;
}

/**
 * Webhook service for delivering events to external endpoints
 */
export class WebhookService {
  private static db: Pool;
  private static redis: any;
  private static deliveryQueue: WebhookDelivery[] = [];
  private static isProcessing = false;

  // Webhook event types
  static readonly EVENT_TYPES = {
    SESSION_CREATED: 'session.created',
    SESSION_UPDATED: 'session.updated',
    SESSION_CANCELLED: 'session.cancelled',
    SESSION_COMPLETED: 'session.completed',
    USER_REGISTERED: 'user.registered',
    USER_PROFILE_UPDATED: 'user.profile.updated',
    MESSAGE_SENT: 'message.sent',
    RATING_SUBMITTED: 'rating.submitted',
    NOTIFICATION_SENT: 'notification.sent'
  };

  static initialize(database: Pool, redisClient: any) {
    this.db = database;
    this.redis = redisClient;
    this.startDeliveryProcessor();
  }

  /**
   * Create a new webhook endpoint
   */
  static async createWebhook(data: {
    url: string;
    events: string[];
    userId: string;
    active?: boolean;
  }): Promise<WebhookEndpoint> {
    const id = crypto.randomUUID();
    const secret = `whsec_${crypto.randomBytes(32).toString('hex')}`;

    const webhook: WebhookEndpoint = {
      id,
      url: data.url,
      events: data.events,
      secret,
      active: data.active !== false,
      userId: data.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      failureCount: 0
    };

    await this.db.query(`
      INSERT INTO webhooks (
        id, url, events, secret, active, user_id, created_at, updated_at, failure_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      webhook.id,
      webhook.url,
      JSON.stringify(webhook.events),
      webhook.secret,
      webhook.active,
      webhook.userId,
      webhook.createdAt,
      webhook.updatedAt,
      webhook.failureCount
    ]);

    return webhook;
  }

  /**
   * Get webhook by ID
   */
  static async getWebhook(id: string): Promise<WebhookEndpoint | null> {
    const result = await this.db.query(`
      SELECT * FROM webhooks WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      url: row.url,
      events: JSON.parse(row.events),
      secret: row.secret,
      active: row.active,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastDeliveryAt: row.last_delivery_at,
      failureCount: row.failure_count
    };
  }

  /**
   * Get webhooks for a user
   */
  static async getUserWebhooks(userId: string): Promise<WebhookEndpoint[]> {
    const result = await this.db.query(`
      SELECT * FROM webhooks WHERE user_id = $1 ORDER BY created_at DESC
    `, [userId]);

    return result.rows.map(row => ({
      id: row.id,
      url: row.url,
      events: JSON.parse(row.events),
      secret: row.secret,
      active: row.active,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastDeliveryAt: row.last_delivery_at,
      failureCount: row.failure_count
    }));
  }

  /**
   * Update webhook
   */
  static async updateWebhook(id: string, updates: Partial<{
    url: string;
    events: string[];
    active: boolean;
  }>): Promise<WebhookEndpoint | null> {
    const webhook = await this.getWebhook(id);
    if (!webhook) {
      return null;
    }

    const updatedWebhook = { ...webhook, ...updates, updatedAt: new Date() };

    await this.db.query(`
      UPDATE webhooks 
      SET url = $1, events = $2, active = $3, updated_at = $4
      WHERE id = $5
    `, [
      updatedWebhook.url,
      JSON.stringify(updatedWebhook.events),
      updatedWebhook.active,
      updatedWebhook.updatedAt,
      id
    ]);

    return updatedWebhook;
  }

  /**
   * Delete webhook
   */
  static async deleteWebhook(id: string): Promise<boolean> {
    const result = await this.db.query(`
      DELETE FROM webhooks WHERE id = $1
    `, [id]);

    return result.rowCount ? result.rowCount > 0 : false;
  }

  /**
   * Trigger webhook event
   */
  static async triggerEvent(eventType: string, data: any, userId?: string): Promise<void> {
    const event: WebhookEvent = {
      id: crypto.randomUUID(),
      type: eventType,
      data,
      timestamp: new Date(),
      version: '1.0'
    };

    // Store event
    await this.db.query(`
      INSERT INTO webhook_events (id, type, data, timestamp, version, user_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [event.id, event.type, JSON.stringify(event.data), event.timestamp, event.version, userId]);

    // Find matching webhooks
    let webhooks: WebhookEndpoint[];
    
    if (userId) {
      webhooks = await this.getUserWebhooks(userId);
    } else {
      const result = await this.db.query(`
        SELECT * FROM webhooks WHERE active = true
      `);
      webhooks = result.rows.map(row => ({
        id: row.id,
        url: row.url,
        events: JSON.parse(row.events),
        secret: row.secret,
        active: row.active,
        userId: row.user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastDeliveryAt: row.last_delivery_at,
        failureCount: row.failure_count
      }));
    }

    // Queue deliveries for matching webhooks
    for (const webhook of webhooks) {
      if (webhook.active && webhook.events.includes(eventType)) {
        await this.queueDelivery(webhook, event);
      }
    }
  }

  /**
   * Queue webhook delivery
   */
  static async queueDelivery(webhook: WebhookEndpoint, event: WebhookEvent): Promise<void> {
    const delivery: WebhookDelivery = {
      id: crypto.randomUUID(),
      webhookId: webhook.id,
      eventId: event.id,
      url: webhook.url,
      attempts: 0,
      success: false,
      createdAt: new Date()
    };

    // Store delivery record
    await this.db.query(`
      INSERT INTO webhook_deliveries (
        id, webhook_id, event_id, url, attempts, success, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      delivery.id,
      delivery.webhookId,
      delivery.eventId,
      delivery.url,
      delivery.attempts,
      delivery.success,
      delivery.createdAt
    ]);

    // Add to delivery queue
    this.deliveryQueue.push(delivery);

    // Also add to Redis queue for persistence
    if (this.redis) {
      await this.redis.lpush('webhook_delivery_queue', JSON.stringify({
        delivery,
        webhook,
        event
      }));
    }
  }

  /**
   * Process webhook deliveries
   */
  static async processDelivery(webhook: WebhookEndpoint, event: WebhookEvent, delivery: WebhookDelivery): Promise<void> {
    const maxAttempts = 5;
    const backoffDelays = [1000, 5000, 15000, 60000, 300000]; // 1s, 5s, 15s, 1m, 5m

    if (delivery.attempts >= maxAttempts) {
      console.log(`Max attempts reached for webhook delivery ${delivery.id}`);
      return;
    }

    try {
      const payload = {
        id: event.id,
        type: event.type,
        data: event.data,
        timestamp: event.timestamp.toISOString(),
        version: event.version
      };

      const signature = this.generateSignature(JSON.stringify(payload), webhook.secret);
      const startTime = Date.now();

      const response = await this.makeHttpRequest(webhook.url, payload, {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event-Type': event.type,
        'X-Webhook-Event-ID': event.id,
        'User-Agent': 'MentorPlatform-Webhooks/1.0'
      });

      const responseTime = Date.now() - startTime;

      if (response.status >= 200 && response.status < 300) {
        // Update delivery record - success
        await this.db.query(`
          UPDATE webhook_deliveries 
          SET attempts = $1, success = $2, http_status = $3, response_time = $4, delivered_at = $5
          WHERE id = $6
        `, [
          delivery.attempts + 1,
          true,
          response.status,
          responseTime,
          new Date(),
          delivery.id
        ]);

        // Update webhook last delivery time and reset failure count
        await this.db.query(`
          UPDATE webhooks 
          SET last_delivery_at = $1, failure_count = 0
          WHERE id = $2
        `, [new Date(), webhook.id]);

        console.log(`Webhook delivery successful: ${delivery.id} to ${webhook.url}`);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.error || 'Request failed'}`);
      }

    } catch (error: any) {
      const responseTime = Date.now() - Date.now();
      const httpStatus = error.status || 0;
      const errorMessage = error.message;

      // Update delivery record - failure
      await this.db.query(`
        UPDATE webhook_deliveries 
        SET attempts = $1, success = $2, http_status = $3, response_time = $4, error_message = $5
        WHERE id = $6
      `, [
        delivery.attempts + 1,
        false,
        httpStatus,
        responseTime,
        errorMessage,
        delivery.id
      ]);

      // Update webhook failure count
      await this.db.query(`
        UPDATE webhooks 
        SET failure_count = failure_count + 1
        WHERE id = $1
      `, [webhook.id]);

      console.error(`Webhook delivery failed: ${delivery.id} to ${webhook.url}`, error.message);

      // Schedule retry if not max attempts
      if (delivery.attempts + 1 < maxAttempts) {
        const delay = backoffDelays[delivery.attempts] || 300000;
        setTimeout(() => {
          this.processDelivery(webhook, event, {
            ...delivery,
            attempts: delivery.attempts + 1
          });
        }, delay);
      } else {
        // Disable webhook if too many failures
        if (webhook.failureCount >= 10) {
          await this.db.query(`
            UPDATE webhooks SET active = false WHERE id = $1
          `, [webhook.id]);
          console.log(`Webhook ${webhook.id} disabled due to excessive failures`);
        }
      }
    }
  }

  /**
   * Generate webhook signature
   */
  static generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify webhook signature
   */
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Start delivery processor
   */
  static startDeliveryProcessor(): void {
    setInterval(async () => {
      if (this.isProcessing || this.deliveryQueue.length === 0) {
        return;
      }

      this.isProcessing = true;

      try {
        // Process deliveries from Redis queue
        if (this.redis) {
          const queueItem = await this.redis.rpop('webhook_delivery_queue');
          if (queueItem) {
            const { delivery, webhook, event } = JSON.parse(queueItem);
            await this.processDelivery(webhook, event, delivery);
          }
        }

        // Process in-memory queue
        const delivery = this.deliveryQueue.shift();
        if (delivery) {
          const webhook = await this.getWebhook(delivery.webhookId);
          if (webhook) {
            const eventResult = await this.db.query(`
              SELECT * FROM webhook_events WHERE id = $1
            `, [delivery.eventId]);

            if (eventResult.rows.length > 0) {
              const eventRow = eventResult.rows[0];
              const event: WebhookEvent = {
                id: eventRow.id,
                type: eventRow.type,
                data: JSON.parse(eventRow.data),
                timestamp: eventRow.timestamp,
                version: eventRow.version
              };

              await this.processDelivery(webhook, event, delivery);
            }
          }
        }
      } catch (error) {
        console.error('Error processing webhook deliveries:', error);
      } finally {
        this.isProcessing = false;
      }
    }, 1000); // Process every second
  }

  /**
   * Get webhook delivery history
   */
  static async getDeliveryHistory(webhookId: string, limit = 50): Promise<WebhookDelivery[]> {
    const result = await this.db.query(`
      SELECT * FROM webhook_deliveries 
      WHERE webhook_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `, [webhookId, limit]);

    return result.rows.map(row => ({
      id: row.id,
      webhookId: row.webhook_id,
      eventId: row.event_id,
      url: row.url,
      httpStatus: row.http_status,
      responseTime: row.response_time,
      attempts: row.attempts,
      success: row.success,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      deliveredAt: row.delivered_at
    }));
  }

  /**
   * Test webhook endpoint
   */
  static async testWebhook(webhookId: string): Promise<{ success: boolean; message: string; responseTime?: number }> {
    const webhook = await this.getWebhook(webhookId);
    if (!webhook) {
      return { success: false, message: 'Webhook not found' };
    }

    const testEvent: WebhookEvent = {
      id: crypto.randomUUID(),
      type: 'webhook.test',
      data: {
        message: 'This is a test webhook delivery',
        timestamp: new Date().toISOString()
      },
      timestamp: new Date(),
      version: '1.0'
    };

    try {
      const payload = JSON.stringify(testEvent);
      const signature = this.generateSignature(payload, webhook.secret);
      const startTime = Date.now();

      const response = await this.makeHttpRequest(webhook.url, testEvent, {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event-Type': testEvent.type,
        'X-Webhook-Event-ID': testEvent.id,
        'User-Agent': 'MentorPlatform-Webhooks/1.0'
      });

      const responseTime = Date.now() - startTime;

      if (response.status >= 200 && response.status < 300) {
        return {
          success: true,
          message: `Test successful (${response.status})`,
          responseTime
        };
      } else {
        return {
          success: false,
          message: response.error || `HTTP ${response.status}`
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Make HTTP request
   */
  private static makeHttpRequest(url: string, data: any, headers: Record<string, string>): Promise<{
    status: number;
    data?: any;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const postData = JSON.stringify(data);
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 30000
      };

      const req = client.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          resolve({
            status: res.statusCode || 500,
            data: responseData
          });
        });
      });

      req.on('error', (error) => {
        resolve({
          status: 0,
          error: error.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          status: 0,
          error: 'Request timeout'
        });
      });

      req.write(postData);
      req.end();
    });
  }
}