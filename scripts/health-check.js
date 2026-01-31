#!/usr/bin/env node

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

console.log('🔍 Mentor Matching Platform - Health Check\n');

// Configuration
const environment = process.env.NODE_ENV || 'development';
const timeout = 10000; // 10 seconds

// Service endpoints to check
const services = {
  development: [
    { name: 'API Gateway', url: 'http://localhost:3000/health' },
    { name: 'Auth Service', url: 'http://localhost:3001/health' },
    { name: 'User Service', url: 'http://localhost:3002/health' },
    { name: 'Session Service', url: 'http://localhost:3003/health' },
    { name: 'Matching Service', url: 'http://localhost:3004/health' },
    { name: 'Communication Service', url: 'http://localhost:3005/health' },
    { name: 'Notification Service', url: 'http://localhost:3006/health' },
    { name: 'Rating Service', url: 'http://localhost:3007/health' },
    { name: 'Admin Service', url: 'http://localhost:3008/health' },
    { name: 'Web App', url: 'http://localhost:3001/health' },
    { name: 'PostgreSQL', url: 'http://localhost:3000/api/health/db' },
    { name: 'Redis', url: 'http://localhost:3000/api/health/redis' },
    { name: 'Elasticsearch', url: 'http://localhost:9200/_cluster/health' }
  ],
  staging: [
    { name: 'Frontend', url: 'https://staging.mentorplatform.com/health' },
    { name: 'API Gateway', url: 'https://api-staging.mentorplatform.com/health' },
    { name: 'Database Health', url: 'https://api-staging.mentorplatform.com/api/health/db' },
    { name: 'Cache Health', url: 'https://api-staging.mentorplatform.com/api/health/redis' }
  ],
  production: [
    { name: 'Frontend', url: 'https://mentorplatform.com/health' },
    { name: 'API Gateway', url: 'https://api.mentorplatform.com/health' },
    { name: 'Database Health', url: 'https://api.mentorplatform.com/api/health/db' },
    { name: 'Cache Health', url: 'https://api.mentorplatform.com/api/health/redis' }
  ]
};

// Health check function
function checkHealth(service) {
  return new Promise((resolve) => {
    const url = new URL(service.url);
    const client = url.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      timeout: timeout,
      headers: {
        'User-Agent': 'Health-Check/1.0'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const isHealthy = res.statusCode >= 200 && res.statusCode < 300;
        resolve({
          name: service.name,
          url: service.url,
          status: isHealthy ? 'healthy' : 'unhealthy',
          statusCode: res.statusCode,
          responseTime: Date.now() - startTime,
          response: data.substring(0, 100) // First 100 chars
        });
      });
    });

    req.on('error', (error) => {
      resolve({
        name: service.name,
        url: service.url,
        status: 'error',
        error: error.message,
        responseTime: Date.now() - startTime
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        name: service.name,
        url: service.url,
        status: 'timeout',
        error: `Request timed out after ${timeout}ms`,
        responseTime: timeout
      });
    });

    const startTime = Date.now();
    req.end();
  });
}

// Infrastructure checks
function checkInfrastructure() {
  console.log('📁 Checking infrastructure...');
  
  const requiredFiles = [
    'package.json',
    'docker-compose.yml',
    '.env.example'
  ];

  let infraChecksPassed = 0;
  
  requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
      console.log(`  ✅ ${file}`);
      infraChecksPassed++;
    } else {
      console.log(`  ❌ ${file} - MISSING`);
    }
  });

  return infraChecksPassed === requiredFiles.length;
}

// Main health check function
async function runHealthChecks() {
  console.log(`🏥 Running health checks for ${environment} environment...\n`);

  // Check infrastructure first
  const infraHealthy = checkInfrastructure();
  console.log('');

  // Get services for current environment
  const servicesToCheck = services[environment] || services.development;
  
  console.log(`🔍 Checking ${servicesToCheck.length} services...\n`);

  // Run all health checks concurrently
  const results = await Promise.all(
    servicesToCheck.map(service => checkHealth(service))
  );

  // Display results
  let healthyCount = 0;
  let totalResponseTime = 0;

  results.forEach(result => {
    const statusIcon = result.status === 'healthy' ? '✅' : 
                      result.status === 'timeout' ? '⏰' : '❌';
    
    console.log(`${statusIcon} ${result.name.padEnd(20)} ${result.url}`);
    
    if (result.status === 'healthy') {
      console.log(`   Response time: ${result.responseTime}ms`);
      healthyCount++;
      totalResponseTime += result.responseTime;
    } else if (result.status === 'timeout') {
      console.log(`   Timeout after ${timeout}ms`);
    } else {
      console.log(`   Error: ${result.error || `HTTP ${result.statusCode}`}`);
    }
    console.log('');
  });

  // Summary
  const successRate = Math.round((healthyCount / servicesToCheck.length) * 100);
  const avgResponseTime = healthyCount > 0 ? Math.round(totalResponseTime / healthyCount) : 0;

  console.log('='.repeat(60));
  console.log('📊 HEALTH CHECK SUMMARY');
  console.log('='.repeat(60));
  console.log(`Environment: ${environment}`);
  console.log(`Services checked: ${servicesToCheck.length}`);
  console.log(`Healthy services: ${healthyCount}`);
  console.log(`Success rate: ${successRate}%`);
  console.log(`Average response time: ${avgResponseTime}ms`);
  console.log(`Infrastructure: ${infraHealthy ? 'OK' : 'Issues detected'}`);

  if (healthyCount === servicesToCheck.length && infraHealthy) {
    console.log('\n🎉 All systems operational!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some services are not healthy.');
    console.log('Please check the failed services above.');
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
  process.exit(1);
});

// Run health checks
runHealthChecks().catch(error => {
  console.error('❌ Health check failed:', error.message);
  process.exit(1);
});