# Mentor Matching Platform

A modern, production-ready web-based mentor matching platform that transforms the existing Java Swing desktop application into a scalable microservices architecture.

## Overview

This platform facilitates connections between mentors and students through session-based mentoring, enhanced with modern features for scalability, security, and user experience. The system supports real-time communication, intelligent matching, and comprehensive session management.

## Architecture

The platform follows a microservices architecture with the following components:

- **API Gateway**: Single entry point for all client requests with authentication and routing
- **Authentication Service**: User registration, login, and JWT token management
- **User Service**: Profile management for mentors and students
- **Session Service**: Session creation, scheduling, and registration management
- **Matching Service**: Intelligent session recommendations and search
- **Communication Service**: Real-time messaging and video call integration
- **Notification Service**: Multi-channel notifications (email, SMS, in-app)
- **Web Application**: React-based frontend for user interaction

## Technology Stack

- **Backend**: Node.js with TypeScript, Express.js
- **Database**: PostgreSQL with Redis for caching
- **Search**: Elasticsearch for advanced search and matching
- **Frontend**: React with TypeScript
- **Real-time**: Socket.IO for WebSocket communication
- **Containerization**: Docker and Docker Compose
- **Testing**: Jest for unit tests, fast-check for property-based testing

## Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- Docker and Docker Compose
- Git

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd mentor-matching-platform
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the development environment**

   ```bash
   npm run setup
   ```

   This command will:
   - Install all dependencies
   - Start PostgreSQL, Redis, and Elasticsearch with Docker
   - Run database migrations and seed data
   - Start all microservices in development mode

5. **Access the application**
   - Web Application: <http://localhost:3001>
   - API Gateway: <http://localhost:3000>
   - API Documentation: <http://localhost:3000/docs>

### Development Commands

```bash
# Start all services in development mode
npm run dev

# Build all packages
npm run build

# Run tests
npm run test

# Run property-based tests
npm run test:pbt

# Lint code
npm run lint

# Start Docker services only
npm run docker:up

# Stop Docker services
npm run docker:down

# Clean build artifacts
npm run clean
```

## Project Structure

```
mentor-matching-platform/
├── packages/                    # Microservices packages
│   ├── shared/                 # Shared types and utilities
│   ├── api-gateway/           # API Gateway service
│   ├── auth-service/          # Authentication service
│   ├── user-service/          # User management service
│   ├── session-service/       # Session management service
│   ├── matching-service/      # Matching and recommendation service
│   ├── communication-service/ # Real-time communication service
│   └── notification-service/  # Notification service
├── apps/                      # Frontend applications
│   └── web-app/              # React web application
├── database/                  # Database scripts and migrations
│   └── init/                 # Database initialization scripts
├── docker-compose.yml         # Docker services configuration
├── turbo.json                # Turborepo configuration
└── package.json              # Root package configuration
```

## Services

### API Gateway (Port 3000)

- Single entry point for all API requests
- Authentication and authorization
- Rate limiting and request routing
- Load balancing and service discovery

### Authentication Service (Port 3001)

- User registration and login
- JWT token generation and validation
- Multi-factor authentication
- Password reset and security policies

### User Service (Port 3002)

- Mentor and student profile management
- Profile image upload and processing
- Privacy settings and user preferences
- User search and discovery

### Session Service (Port 3003)

- Session creation and scheduling
- Registration and waitlist management
- Capacity tracking and availability
- Session materials and resources

### Matching Service (Port 3004)

- Intelligent session recommendations
- Advanced search and filtering
- Compatibility scoring algorithms
- Learning from user feedback

### Communication Service (Port 3005)

- Real-time messaging between users
- Video call integration
- Message history and search
- File sharing capabilities

### Notification Service (Port 3006)

- Multi-channel notification delivery
- User preference management
- Scheduled notifications and reminders
- Delivery tracking and retry logic

## Database Schema

The platform uses PostgreSQL with the following main entities:

- **Users**: Core user accounts with authentication
- **Mentor/Student Profiles**: Role-specific profile information
- **Sessions**: Mentoring sessions with scheduling and capacity
- **Messages**: Real-time communication between users
- **Notifications**: System notifications and user preferences
- **Reviews**: Session ratings and feedback
- **Audit Logs**: Security and compliance tracking

## API Documentation

Each service provides OpenAPI/Swagger documentation:

- API Gateway: <http://localhost:3000/docs>
- Authentication: <http://localhost:3001/docs>
- User Service: <http://localhost:3002/docs>
- Session Service: <http://localhost:3003/docs>
- Matching Service: <http://localhost:3004/docs>
- Communication: <http://localhost:3005/docs>
- Notifications: <http://localhost:3006/docs>

## Testing

The platform uses a dual testing approach:

### Unit Tests

```bash
npm run test
```

- Specific examples and edge cases
- Integration between services
- Error handling and validation

### Property-Based Tests

```bash
npm run test:pbt
```

- Universal properties across all inputs
- Comprehensive input coverage
- Correctness validation

## Security Features

- JWT-based authentication with refresh tokens
- Role-based access control (RBAC)
- Multi-factor authentication (MFA)
- Data encryption at rest and in transit
- Rate limiting and DDoS protection
- Input validation and sanitization
- Audit logging for compliance

## Performance Features

- Redis caching for frequently accessed data
- Database query optimization with indexes
- Connection pooling for database connections
- Compression and response optimization
- CDN integration for static assets
- Auto-scaling with Docker Swarm/Kubernetes

## Monitoring and Observability

- Health check endpoints for all services
- Structured logging with correlation IDs
- Performance metrics and monitoring
- Error tracking and alerting
- Distributed tracing support

## Deployment

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm run docker:build
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables

Key environment variables for production:

- `JWT_SECRET`: Strong secret key for JWT tokens
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `EMAIL_SERVICE_API_KEY`: Email service API key
- `SMS_SERVICE_API_KEY`: SMS service API key

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:

- Create an issue in the GitHub repository
- Check the documentation in each service's README
- Review the API documentation at the service endpoints
