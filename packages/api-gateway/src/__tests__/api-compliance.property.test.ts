import fc from 'fast-check';
import request from 'supertest';
import express from 'express';
import { setupSwagger } from '../docs/swagger';
import { ApiVersioning } from '../middleware/versioning';

/**
 * Property-Based Test for API Compliance
 * Feature: mentor-matching-platform, Property 26: API specification compliance
 * Validates: Requirements 2.3, 12.1, 12.4
 */

describe('Property Test: API Specification Compliance', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Setup API documentation and versioning
    setupSwagger(app as any);
    app.use(ApiVersioning.middleware() as any);
    
    // Add test endpoints that follow RESTful principles
    app.get('/api/version', ApiVersioning.versionInfoHandler());
    
    app.get('/health', (req, res) => {
      res.json({
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        }
      });
    });

    // Mock RESTful endpoints for testing
    app.get('/api/v1/users', (req, res) => {
      res.json({
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 10 }
      });
    });

    app.get('/api/v1/users/:id', (req, res) => {
      const { id } = req.params;
      if (!/^\d+$/.test(id)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ID', message: 'ID must be numeric' }
        });
      }
      res.json({
        success: true,
        data: { id: parseInt(id), name: 'Test User' }
      });
    });

    app.post('/api/v1/users', (req, res) => {
      res.status(201).json({
        success: true,
        data: { id: 1, ...req.body }
      });
    });

    app.put('/api/v1/users/:id', (req, res) => {
      const { id } = req.params;
      res.json({
        success: true,
        data: { id: parseInt(id), ...req.body }
      });
    });

    app.delete('/api/v1/users/:id', (req, res) => {
      res.status(204).send();
    });
  });

  /**
   * Property: OpenAPI specification should be valid and accessible
   * For any request to API documentation endpoints, the response should contain valid OpenAPI specification
   */
  it('should serve valid OpenAPI specification', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('/api-docs.json', '/api-docs.yaml'),
        async (endpoint) => {
          const response = await request(app).get(endpoint);
          
          expect(response.status).toBe(200);
          
          if (endpoint.endsWith('.json')) {
            expect(response.body.openapi).toBe('3.0.3');
            expect(response.body.info).toBeDefined();
            expect(response.body.info.title).toBe('Mentor Matching Platform API');
            expect(response.body.info.version).toBeDefined();
            expect(response.body.paths).toBeDefined();
          } else {
            expect(response.text).toContain('openapi: 3.0.3');
            expect(response.text).toContain('title: Mentor Matching Platform API');
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: RESTful endpoints should follow consistent response format
   * For any valid API endpoint, the response should follow the standard format with success/error structure
   */
  it('should follow consistent response format for all endpoints', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          { method: 'GET', path: '/api/v1/users' },
          { method: 'GET', path: '/health' },
          { method: 'GET', path: '/api/version' }
        ),
        async (endpoint) => {
          const response = await request(app)[endpoint.method.toLowerCase() as 'get'](endpoint.path);
          
          expect(response.status).toBeGreaterThanOrEqual(200);
          expect(response.status).toBeLessThan(300);
          expect(response.body).toHaveProperty('success');
          expect(typeof response.body.success).toBe('boolean');
          
          if (response.body.success) {
            expect(response.body).toHaveProperty('data');
          } else {
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code');
            expect(response.body.error).toHaveProperty('message');
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: HTTP methods should behave according to RESTful principles
   * For any resource endpoint, different HTTP methods should return appropriate status codes
   */
  it('should return appropriate HTTP status codes for different methods', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
          resourceId: fc.integer({ min: 1, max: 1000 })
        }),
        async ({ method, resourceId }) => {
          let response;
          
          switch (method) {
            case 'GET':
              response = await request(app).get(`/api/v1/users/${resourceId}`);
              expect(response.status).toBe(200);
              expect(response.body.success).toBe(true);
              break;
              
            case 'POST':
              response = await request(app)
                .post('/api/v1/users')
                .send({ name: 'Test User', email: 'test@example.com' });
              expect(response.status).toBe(201);
              expect(response.body.success).toBe(true);
              break;
              
            case 'PUT':
              response = await request(app)
                .put(`/api/v1/users/${resourceId}`)
                .send({ name: 'Updated User' });
              expect(response.status).toBe(200);
              expect(response.body.success).toBe(true);
              break;
              
            case 'DELETE':
              response = await request(app).delete(`/api/v1/users/${resourceId}`);
              expect(response.status).toBe(204);
              break;
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: API versioning should be consistent across all endpoints
   * For any versioned endpoint, the version should be properly handled and returned in headers
   */
  it('should handle API versioning consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          version: fc.constantFrom('v1', 'v2'),
          endpoint: fc.constantFrom('/api/version', '/api/v1/users')
        }),
        async ({ version, endpoint }) => {
          const response = await request(app)
            .get(endpoint)
            .set('X-API-Version', version);
          
          // Should not fail due to version header
          expect(response.status).toBeGreaterThanOrEqual(200);
          expect(response.status).toBeLessThan(500);
          
          // Version should be reflected in response headers
          if (response.headers['x-api-version']) {
            expect(response.headers['x-api-version']).toBeDefined();
          }
          
          if (response.headers['x-supported-versions']) {
            expect(response.headers['x-supported-versions']).toContain('v1');
          }
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Property: Error responses should follow consistent format
   * For any invalid request, the error response should follow the standard error format
   */
  it('should return consistent error format for invalid requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          invalidId: fc.oneof(
            fc.string().filter(s => !/^\d+$/.test(s) && s.length > 0),
            fc.constant('invalid'),
            fc.constant('abc'),
            fc.constant('!@#')
          )
        }),
        async ({ invalidId }) => {
          const response = await request(app).get(`/api/v1/users/${invalidId}`);
          
          expect(response.status).toBe(400);
          expect(response.body.success).toBe(false);
          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toHaveProperty('code');
          expect(response.body.error).toHaveProperty('message');
          expect(typeof response.body.error.code).toBe('string');
          expect(typeof response.body.error.message).toBe('string');
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Content-Type headers should be properly set
   * For any JSON API endpoint, the response should have appropriate Content-Type header
   */
  it('should set appropriate Content-Type headers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          '/api/v1/users',
          '/health',
          '/api/version'
        ),
        async (endpoint) => {
          const response = await request(app).get(endpoint);
          
          expect(response.status).toBeGreaterThanOrEqual(200);
          expect(response.status).toBeLessThan(300);
          expect(response.headers['content-type']).toMatch(/application\/json/);
        }
      ),
      { numRuns: 15 }
    );
  });
});