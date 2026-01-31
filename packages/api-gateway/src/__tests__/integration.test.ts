import request from 'supertest';
import express from 'express';
import { setupSwagger } from '../docs/swagger';
import { ApiVersioning } from '../middleware/versioning';

describe('API Gateway Integration', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Setup basic routes for testing
    setupSwagger(app as any);
    app.use(ApiVersioning.middleware() as any);
    
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
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
    });
  });

  describe('API Documentation', () => {
    it('should serve OpenAPI JSON spec', async () => {
      const response = await request(app)
        .get('/api-docs.json')
        .expect(200);

      expect(response.body.openapi).toBe('3.0.3');
      expect(response.body.info.title).toBe('Mentor Matching Platform API');
    });

    it('should serve API documentation page', async () => {
      const response = await request(app)
        .get('/api-docs')
        .expect(200);

      expect(response.text).toContain('Mentor Matching Platform API');
      expect(response.text).toContain('Version: 1.0.0');
    });
  });

  describe('API Versioning', () => {
    it('should return version information', async () => {
      const response = await request(app)
        .get('/api/version')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.currentVersion).toBe('v1');
      expect(response.body.data.supportedVersions).toContain('v1');
    });

    it('should handle version headers', async () => {
      const response = await request(app)
        .get('/api/version')
        .set('X-API-Version', 'v1')
        .expect(200);

      expect(response.headers['x-api-version']).toBe('v1');
      expect(response.headers['x-supported-versions']).toContain('v1');
    });
  });
});