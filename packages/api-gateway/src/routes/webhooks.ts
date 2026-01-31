import { Router, Request, Response } from 'express';
import { WebhookService } from '../services/webhookService';
import { ApiKeyAuth, ApiKeyRequest } from '../middleware/apiKey';
import { AuthUtils } from '@mentor-platform/shared';

const router = Router();

// Using global Express Request extension from @mentor-platform/shared

/**
 * @swagger
 * /webhooks:
 *   get:
 *     tags:
 *       - Webhooks
 *     summary: List webhooks
 *     description: Get all webhooks for the authenticated user
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Webhooks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Webhook'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/', async (req: Request & ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.apiKey?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User authentication required'
        },
        timestamp: new Date().toISOString()
      });
    }

    const webhooks = await WebhookService.getUserWebhooks(userId);

    // Remove sensitive data (secret) from response
    const sanitizedWebhooks = webhooks.map(webhook => ({
      ...webhook,
      secret: undefined
    }));

    res.json({
      success: true,
      data: sanitizedWebhooks,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch webhooks'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /webhooks:
 *   post:
 *     tags:
 *       - Webhooks
 *     summary: Create a webhook
 *     description: Create a new webhook endpoint for receiving platform events
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *               - events
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: The URL to send webhook events to
 *                 example: "https://your-app.com/webhooks/mentor-platform"
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [session.created, session.updated, session.cancelled, user.registered, message.sent]
 *                 description: List of events to subscribe to
 *                 example: ["session.created", "session.cancelled"]
 *               active:
 *                 type: boolean
 *                 default: true
 *                 description: Whether the webhook is active
 *     responses:
 *       201:
 *         description: Webhook created successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/', async (req: Request & ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.apiKey?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User authentication required'
        },
        timestamp: new Date().toISOString()
      });
    }

    const { url, events, active } = req.body;

    // Validation
    if (!url || !events || !Array.isArray(events)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'URL and events array are required'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid URL format'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Validate events
    const validEvents = Object.values(WebhookService.EVENT_TYPES);
    const invalidEvents = events.filter((event: string) => !validEvents.includes(event));
    
    if (invalidEvents.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid events: ${invalidEvents.join(', ')}`,
          validEvents
        },
        timestamp: new Date().toISOString()
      });
    }

    const webhook = await WebhookService.createWebhook({
      url,
      events,
      userId,
      active
    });

    res.status(201).json({
      success: true,
      data: {
        ...webhook,
        secret: undefined // Don't expose secret in response
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating webhook:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create webhook'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /webhooks/{webhookId}:
 *   get:
 *     tags:
 *       - Webhooks
 *     summary: Get webhook details
 *     description: Retrieve details of a specific webhook
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: webhookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The webhook ID
 *     responses:
 *       200:
 *         description: Webhook retrieved successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:webhookId', async (req: Request & ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.apiKey?.userId;
    const { webhookId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User authentication required'
        },
        timestamp: new Date().toISOString()
      });
    }

    const webhook = await WebhookService.getWebhook(webhookId);

    if (!webhook || webhook.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: {
        ...webhook,
        secret: undefined // Don't expose secret
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching webhook:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch webhook'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /webhooks/{webhookId}:
 *   put:
 *     tags:
 *       - Webhooks
 *     summary: Update webhook
 *     description: Update an existing webhook configuration
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: webhookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The webhook ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [session.created, session.updated, session.cancelled, user.registered, message.sent]
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Webhook updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put('/:webhookId', async (req: Request & ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.apiKey?.userId;
    const { webhookId } = req.params;
    const { url, events, active } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User authentication required'
        },
        timestamp: new Date().toISOString()
      });
    }

    const existingWebhook = await WebhookService.getWebhook(webhookId);

    if (!existingWebhook || existingWebhook.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Validate URL if provided
    if (url) {
      try {
        new URL(url);
      } catch {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid URL format'
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    // Validate events if provided
    if (events) {
      const validEvents = Object.values(WebhookService.EVENT_TYPES);
      const invalidEvents = events.filter((event: string) => !validEvents.includes(event));
      
      if (invalidEvents.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid events: ${invalidEvents.join(', ')}`,
            validEvents
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    const updatedWebhook = await WebhookService.updateWebhook(webhookId, {
      url,
      events,
      active
    });

    res.json({
      success: true,
      data: {
        ...updatedWebhook,
        secret: undefined
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating webhook:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update webhook'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /webhooks/{webhookId}:
 *   delete:
 *     tags:
 *       - Webhooks
 *     summary: Delete webhook
 *     description: Delete a webhook endpoint
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: webhookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The webhook ID
 *     responses:
 *       200:
 *         description: Webhook deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete('/:webhookId', async (req: Request & ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.apiKey?.userId;
    const { webhookId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User authentication required'
        },
        timestamp: new Date().toISOString()
      });
    }

    const webhook = await WebhookService.getWebhook(webhookId);

    if (!webhook || webhook.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const deleted = await WebhookService.deleteWebhook(webhookId);

    if (!deleted) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete webhook'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: {
        message: 'Webhook deleted successfully'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete webhook'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /webhooks/{webhookId}/test:
 *   post:
 *     tags:
 *       - Webhooks
 *     summary: Test webhook
 *     description: Send a test event to the webhook endpoint
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: webhookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The webhook ID
 *     responses:
 *       200:
 *         description: Test completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     testSuccess:
 *                       type: boolean
 *                     message:
 *                       type: string
 *                     responseTime:
 *                       type: number
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post('/:webhookId/test', async (req: Request & ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.apiKey?.userId;
    const { webhookId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User authentication required'
        },
        timestamp: new Date().toISOString()
      });
    }

    const webhook = await WebhookService.getWebhook(webhookId);

    if (!webhook || webhook.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const testResult = await WebhookService.testWebhook(webhookId);

    res.json({
      success: true,
      data: {
        testSuccess: testResult.success,
        message: testResult.message,
        responseTime: testResult.responseTime
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error testing webhook:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to test webhook'
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /webhooks/{webhookId}/deliveries:
 *   get:
 *     tags:
 *       - Webhooks
 *     summary: Get webhook delivery history
 *     description: Retrieve delivery history for a webhook
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: webhookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The webhook ID
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of deliveries to return
 *     responses:
 *       200:
 *         description: Delivery history retrieved successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:webhookId/deliveries', async (req: Request & ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.apiKey?.userId;
    const { webhookId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User authentication required'
        },
        timestamp: new Date().toISOString()
      });
    }

    const webhook = await WebhookService.getWebhook(webhookId);

    if (!webhook || webhook.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    const deliveries = await WebhookService.getDeliveryHistory(webhookId, limit);

    res.json({
      success: true,
      data: deliveries,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching webhook deliveries:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch webhook deliveries'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export { router as webhookRoutes };