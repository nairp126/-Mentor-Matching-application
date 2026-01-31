# Mentor Matching Platform - Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the Mentor Matching Platform, a production-ready web application built with microservices architecture.

## Architecture

The platform consists of:

### Backend Services
- **API Gateway** (Port 3000) - Request routing and load balancing
- **Authentication Service** (Port 3001) - User auth, JWT, MFA, RBAC
- **User Service** (Port 3002) - Profile management, image upload, privacy
- **Session Service** (Port 3003) - Session CRUD, recurring sessions, registrations
- **Matching Service** (Port 3004) - Recommendations, search, preferences
- **Communication Service** (Port 3005) - Real-time messaging, video calls
- **Notification Service** (Port 3006) - Multi-channel notifications, reminders
- **Rating Service** (Port 3007) - Post-session ratings, reviews, analytics
- **Admin Service** (Port 3008) - User management, system metrics, audit logs

### Frontend
- **Web Application** (Port 3001) - React SPA with Material-UI

### Infrastructure
- **PostgreSQL** (Port 5432) - Primary database
- **Redis** (Port 6379) - Caching and session storage
- **Docker** - Containerization

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for development)
- PostgreSQL 14+ (if running without Docker)
- Redis 6+ (if running without Docker)

## Quick Start with Docker

1. **Clone and setup environment**:
```bash
git clone <repository-url>
cd mentor-matching-platform
cp .env.example .env
```

2. **Configure environment variables** in `.env`:
```env
# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=mentor_platform
DB_USER=postgres
DB_PASSWORD=your_secure_password

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

# Email (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# File Storage
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# External APIs
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_number
```

3. **Automated deployment** (recommended):
```bash
# For Linux/macOS
npm run deploy:dev

# For Windows
npm run deploy:dev:win
```

4. **Manual deployment** (alternative):
```bash
docker-compose up -d
npm run migrate  # Run database migrations
```

5. **Access the application**:
- Frontend: http://localhost:3001
- API Gateway: http://localhost:3000
- Individual services: http://localhost:300X (where X is service number)

## Development Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Start development servers**:
```bash
# Start all services in development mode
npm run dev

# Or start individual services
npm run dev:auth
npm run dev:user
npm run dev:session
# etc.
```

3. **Run tests**:
```bash
# Run all tests
npm test

# Run tests for specific service
npm run test:auth
npm run test:user
# etc.
```

## Production Deployment

### Automated Deployment (Recommended)

1. **Prepare production environment**:
```bash
# Copy and configure production environment
cp .env.production .env.production.local
# Edit .env.production.local with your production values
```

2. **Deploy to production**:
```bash
# For Linux/macOS
npm run deploy:prod

# For Windows
npm run deploy:prod:win
```

3. **Verify deployment**:
```bash
npm run health-check
```

### Manual Deployment Options

#### Option 1: Docker Swarm

1. **Initialize swarm**:
```bash
docker swarm init
```

2. **Deploy stack**:
```bash
docker stack deploy -c docker-compose.prod.yml mentor-platform
```

#### Option 2: Kubernetes

1. **Apply configurations**:
```bash
kubectl apply -f k8s/
```

2. **Check deployment status**:
```bash
kubectl get pods
kubectl get services
```

#### Option 3: Cloud Deployment (AWS/GCP/Azure)

Refer to cloud-specific deployment guides in the `deployment/` directory.

### CI/CD Pipeline

The platform includes a comprehensive CI/CD pipeline using GitHub Actions:

1. **Automated Testing**: Runs unit tests, integration tests, and property-based tests
2. **Security Scanning**: Performs dependency vulnerability scanning
3. **Docker Image Building**: Builds and pushes Docker images to registry
4. **Automated Deployment**: Deploys to staging and production environments
5. **Health Checks**: Runs post-deployment health checks
6. **Rollback Support**: Automatic rollback on deployment failure

**Pipeline Configuration**: `.github/workflows/ci-cd.yml`

## Database Migrations

### Automated Migration (Recommended)
```bash
# For Linux/macOS
npm run migrate

# For Windows
npm run migrate:win
```

### Manual Migration
Run migrations in order:
```bash
# Apply all migrations
npm run migrate

# Or apply individually
psql -U postgres -d mentor_platform -f database/migrations/001-add-security-events-table.sql
psql -U postgres -d mentor_platform -f database/migrations/003-notification-service-tables.sql
# etc.
```

## Monitoring and Health Checks

### Built-in Monitoring Stack

Start the monitoring stack:
```bash
npm run monitoring:up
```

**Monitoring Services**:
- **Prometheus**: http://localhost:9090 - Metrics collection
- **Grafana**: http://localhost:3001 - Metrics visualization (admin/admin)
- **AlertManager**: http://localhost:9093 - Alert management
- **Node Exporter**: http://localhost:9100 - System metrics
- **cAdvisor**: http://localhost:8080 - Container metrics

### Health Check Endpoints
- API Gateway: `GET /health`
- Each service: `GET /health`

### Automated Health Checks
```bash
npm run health-check
```

### Key Metrics to Monitor
- Response times (< 200ms for most endpoints)
- Error rates (< 1%)
- Database connection pool usage
- Redis cache hit rates
- Active WebSocket connections
- Queue processing times

## Rollback Procedures

### Automated Rollback
```bash
# For Linux/macOS
bash scripts/rollback.sh production

# For Windows
powershell -ExecutionPolicy Bypass -File scripts/rollback.ps1 production
```

### Manual Rollback
1. **Stop current services**:
```bash
docker-compose -f docker-compose.prod.yml down
```

2. **Restore previous version**:
```bash
# Pull previous version images
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

3. **Verify rollback**:
```bash
npm run health-check
```

## Security Considerations

### Authentication & Authorization
- JWT tokens with 24-hour expiration
- Multi-factor authentication (TOTP)
- Role-based access control (RBAC)
- Rate limiting on all endpoints

### Data Protection
- Encryption at rest for sensitive data
- HTTPS enforcement
- Input validation and sanitization
- SQL injection prevention
- XSS protection

### Infrastructure Security
- Container security scanning
- Network segmentation
- Secrets management
- Regular security updates

## Performance Optimization

### Caching Strategy
- Redis for session storage
- Database query result caching
- Static asset caching
- API response caching

### Database Optimization
- Proper indexing on frequently queried columns
- Connection pooling
- Query optimization
- Read replicas for scaling

### Load Balancing
- API Gateway for request distribution
- Horizontal scaling of services
- Database connection pooling
- CDN for static assets

## Troubleshooting

### Common Issues

1. **Database Connection Errors**:
   - Check database credentials in `.env`
   - Ensure PostgreSQL is running
   - Verify network connectivity

2. **Redis Connection Errors**:
   - Check Redis configuration
   - Verify Redis is running and accessible
   - Check authentication credentials

3. **Service Communication Errors**:
   - Verify service discovery configuration
   - Check network policies
   - Ensure all services are healthy

4. **Authentication Issues**:
   - Verify JWT secret configuration
   - Check token expiration settings
   - Ensure MFA setup is correct

### Debugging Commands

```bash
# Check service logs
docker-compose logs -f [service-name]

# Check database connections
docker-compose exec postgres psql -U postgres -d mentor_platform -c "SELECT COUNT(*) FROM users;"

# Check Redis connectivity
docker-compose exec redis redis-cli ping

# Run health checks
curl http://localhost:3000/health
```

## Backup and Recovery

### Database Backup
```bash
# Create backup
docker-compose exec postgres pg_dump -U postgres mentor_platform > backup.sql

# Restore backup
docker-compose exec postgres psql -U postgres mentor_platform < backup.sql
```

### File Storage Backup
```bash
# Backup uploaded files
tar -czf uploads-backup.tar.gz uploads/
```

## Scaling Guidelines

### Horizontal Scaling
- Scale individual services based on load
- Use load balancers for distribution
- Implement service mesh for complex deployments

### Database Scaling
- Read replicas for read-heavy workloads
- Connection pooling optimization
- Query optimization and indexing

### Caching Scaling
- Redis clustering for high availability
- Cache warming strategies
- Cache invalidation patterns

## Support and Maintenance

### Regular Maintenance Tasks
- Database maintenance and optimization
- Log rotation and cleanup
- Security updates and patches
- Performance monitoring and tuning

### Monitoring Alerts
- High error rates
- Slow response times
- Database connection issues
- High memory/CPU usage
- Failed health checks

## API Documentation

API documentation is available at:
- Swagger UI: http://localhost:3000/api-docs
- OpenAPI spec: http://localhost:3000/api-docs.json

## Contributing

See `CONTRIBUTING.md` for development guidelines and contribution process.

## License

See `LICENSE` file for license information.