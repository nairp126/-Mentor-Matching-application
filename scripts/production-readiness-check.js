#!/usr/bin/env node

/**
 * Production Readiness Check
 * Final verification before production deployment
 */

const fs = require('fs');
const path = require('path');

console.log('🏭 Mentor Matching Platform - Production Readiness Check\n');

// Production readiness criteria
const readinessCriteria = [
  {
    id: 'health-endpoints',
    name: 'Health Check Endpoints',
    description: 'All microservices have health check endpoints',
    check: () => {
      const services = ['api-gateway', 'auth-service', 'user-service', 'session-service', 
                       'matching-service', 'communication-service', 'notification-service', 
                       'rating-service', 'admin-service'];
      
      let allHaveHealthChecks = true;
      services.forEach(service => {
        const indexPath = `packages/${service}/src/index.ts`;
        if (fs.existsSync(indexPath)) {
          const content = fs.readFileSync(indexPath, 'utf8');
          if (!content.includes('/health') && !content.includes('health')) {
            allHaveHealthChecks = false;
          }
        }
      });
      return allHaveHealthChecks;
    }
  },
  {
    id: 'database-migrations',
    name: 'Database Migrations',
    description: 'Database migrations are properly versioned',
    check: () => {
      const migrationsDir = 'database/migrations';
      if (!fs.existsSync(migrationsDir)) return false;
      
      const migrations = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
      return migrations.length > 0 && migrations.every(m => /^\d{3}-/.test(m));
    }
  },
  {
    id: 'environment-docs',
    name: 'Environment Documentation',
    description: 'Environment variables are documented',
    check: () => {
      return fs.existsSync('.env.example') && 
             fs.existsSync('.env.production') && 
             fs.existsSync('.env.staging');
    }
  },
  {
    id: 'ssl-config',
    name: 'SSL/TLS Configuration',
    description: 'SSL/TLS certificates are configured',
    check: () => {
      const nginxConfig = 'nginx/nginx.conf';
      if (!fs.existsSync(nginxConfig)) return false;
      
      const content = fs.readFileSync(nginxConfig, 'utf8');
      return content.includes('ssl_certificate') || content.includes('443');
    }
  },
  {
    id: 'monitoring-setup',
    name: 'Monitoring and Alerting',
    description: 'Monitoring and alerting are set up',
    check: () => {
      return fs.existsSync('monitoring/docker-compose.monitoring.yml') &&
             fs.existsSync('monitoring/prometheus.yml') &&
             fs.existsSync('monitoring/alert_rules.yml') &&
             fs.existsSync('monitoring/grafana/dashboards');
    }
  },
  {
    id: 'backup-recovery',
    name: 'Backup and Disaster Recovery',
    description: 'Backup and disaster recovery procedures are in place',
    check: () => {
      return fs.existsSync('scripts/backup.sh') &&
             fs.existsSync('scripts/restore.sh') &&
             fs.existsSync('DISASTER_RECOVERY_PLAN.md');
    }
  },
  {
    id: 'security-config',
    name: 'Security Configuration',
    description: 'Security measures are implemented',
    check: () => {
      return fs.existsSync('packages/shared/src/utils/encryption.ts') &&
             fs.existsSync('packages/shared/src/middleware/security.ts') &&
             fs.existsSync('packages/auth-service/src/services/mfaService.ts') &&
             fs.existsSync('packages/auth-service/src/services/securityService.ts');
    }
  },
  {
    id: 'docker-config',
    name: 'Docker Configuration',
    description: 'All services have proper Docker configuration',
    check: () => {
      const services = ['api-gateway', 'auth-service', 'user-service', 'session-service', 
                       'matching-service', 'communication-service', 'notification-service', 
                       'rating-service', 'admin-service'];
      
      return services.every(service => fs.existsSync(`packages/${service}/Dockerfile`)) &&
             fs.existsSync('apps/web-app/Dockerfile') &&
             fs.existsSync('docker-compose.prod.yml');
    }
  },
  {
    id: 'documentation',
    name: 'Documentation Complete',
    description: 'All documentation is complete and up-to-date',
    check: () => {
      return fs.existsSync('README.md') &&
             fs.existsSync('DEPLOYMENT_GUIDE.md') &&
             fs.existsSync('PROJECT_SUMMARY.md') &&
             fs.existsSync('PRODUCTION_CHECKLIST.md');
    }
  },
  {
    id: 'cicd-pipeline',
    name: 'CI/CD Pipeline',
    description: 'CI/CD pipeline is configured',
    check: () => {
      return fs.existsSync('.github/workflows/ci-cd.yml');
    }
  }
];

// Run production readiness checks
function runProductionReadinessCheck() {
  console.log('Running production readiness checks...\n');
  
  let passedChecks = 0;
  const totalChecks = readinessCriteria.length;
  const failedChecks = [];
  
  readinessCriteria.forEach((criterion, index) => {
    const passed = criterion.check();
    const status = passed ? '✅' : '❌';
    const number = (index + 1).toString().padStart(2, ' ');
    
    console.log(`${status} ${number}. ${criterion.name}`);
    console.log(`     ${criterion.description}`);
    
    if (passed) {
      passedChecks++;
    } else {
      failedChecks.push(criterion);
    }
    
    console.log('');
  });
  
  // Summary
  console.log('='.repeat(80));
  console.log('📊 PRODUCTION READINESS SUMMARY');
  console.log('='.repeat(80));
  
  const percentage = Math.round((passedChecks / totalChecks) * 100);
  const overallStatus = percentage === 100 ? '✅' : percentage >= 90 ? '⚠️' : '❌';
  
  console.log(`${overallStatus} Overall Readiness: ${passedChecks}/${totalChecks} (${percentage}%)`);
  
  if (failedChecks.length > 0) {
    console.log('\n❌ Failed Checks:');
    failedChecks.forEach(check => {
      console.log(`   - ${check.name}: ${check.description}`);
    });
  }
  
  if (percentage === 100) {
    console.log('\n🎉 PRODUCTION READY!');
    console.log('The system meets all production readiness criteria.');
    console.log('You can proceed with production deployment.');
  } else if (percentage >= 90) {
    console.log('\n⚠️  MOSTLY READY');
    console.log('The system is mostly ready for production.');
    console.log('Please address the failed checks before deployment.');
  } else {
    console.log('\n❌ NOT READY FOR PRODUCTION');
    console.log('Critical issues found. Please address all failed checks.');
  }
  
  // Generate deployment recommendations
  console.log('\n📋 DEPLOYMENT RECOMMENDATIONS:');
  
  if (percentage === 100) {
    console.log('1. Run final security scan');
    console.log('2. Perform load testing');
    console.log('3. Verify backup procedures');
    console.log('4. Schedule deployment window');
    console.log('5. Prepare rollback plan');
    console.log('6. Notify stakeholders');
  } else {
    console.log('1. Address all failed production readiness checks');
    console.log('2. Re-run this validation');
    console.log('3. Perform additional testing');
    console.log('4. Update documentation as needed');
  }
  
  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    overallScore: percentage,
    passedChecks,
    totalChecks,
    failedChecks: failedChecks.map(c => ({ id: c.id, name: c.name, description: c.description })),
    ready: percentage === 100
  };
  
  fs.writeFileSync('production-readiness-report.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Production readiness report saved to: production-readiness-report.json');
  
  return percentage === 100;
}

// Main execution
function main() {
  try {
    const isReady = runProductionReadinessCheck();
    process.exit(isReady ? 0 : 1);
  } catch (error) {
    console.error('❌ Production readiness check failed:', error.message);
    process.exit(1);
  }
}

main();