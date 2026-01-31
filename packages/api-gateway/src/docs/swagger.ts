import { Express } from 'express';
import path from 'path';
import fs from 'fs';

// Simple OpenAPI spec without external dependencies
const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Mentor Matching Platform API',
    version: '1.0.0',
    description: 'A comprehensive API for the mentor matching platform',
  },
  servers: [
    {
      url: process.env.NODE_ENV === 'production' 
        ? 'https://api.mentorplatform.com/api'
        : 'http://localhost:3000/api',
      description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
    },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check endpoint',
        responses: {
          '200': {
            description: 'API is healthy'
          }
        }
      }
    }
  }
};

export const setupSwagger = (app: Express): void => {
  // Serve raw OpenAPI spec
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(openApiSpec);
  });

  // Simple documentation page
  app.get('/api-docs', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Mentor Platform API Documentation</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .endpoint { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .method { display: inline-block; padding: 5px 10px; border-radius: 3px; color: white; font-weight: bold; }
        .get { background: #61affe; }
        .post { background: #49cc90; }
        .put { background: #fca130; }
        .delete { background: #f93e3e; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Mentor Matching Platform API</h1>
        <p>Version: 1.0.0</p>
        <p>A comprehensive API for the mentor matching platform</p>
      </div>
      
      <h2>Available Endpoints</h2>
      
      <div class="endpoint">
        <span class="method get">GET</span>
        <strong>/health</strong>
        <p>Health check endpoint - Check if the API is running and healthy</p>
      </div>
      
      <div class="endpoint">
        <span class="method get">GET</span>
        <strong>/api/version</strong>
        <p>API version information</p>
      </div>
      
      <div class="endpoint">
        <span class="method get">GET</span>
        <strong>/api-docs.json</strong>
        <p>OpenAPI specification in JSON format</p>
      </div>
      
      <h2>Authentication</h2>
      <p>Most endpoints require authentication using JWT tokens or API keys.</p>
      
      <h3>JWT Authentication</h3>
      <p>Include the token in the Authorization header:</p>
      <code>Authorization: Bearer &lt;your-jwt-token&gt;</code>
      
      <h3>API Key Authentication</h3>
      <p>Include the API key in the X-API-Key header:</p>
      <code>X-API-Key: &lt;your-api-key&gt;</code>
      
      <h2>Rate Limiting</h2>
      <ul>
        <li>General endpoints: 100 requests per 15 minutes</li>
        <li>Authentication endpoints: 5 requests per 15 minutes</li>
      </ul>
    </body>
    </html>
    `;
    res.send(html);
  });

  console.log('📚 API Documentation available at:');
  console.log(`   Simple UI: http://localhost:${process.env.PORT || 3000}/api-docs`);
  console.log(`   OpenAPI JSON: http://localhost:${process.env.PORT || 3000}/api-docs.json`);
};

export { openApiSpec };