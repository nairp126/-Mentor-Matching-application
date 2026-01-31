#!/bin/bash

# Mentor Matching Platform - Deployment Script
# This script automates the deployment process for different environments

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT=${1:-development}
VERSION=${2:-latest}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
Mentor Matching Platform Deployment Script

Usage: $0 [ENVIRONMENT] [VERSION]

ENVIRONMENT:
    development  - Deploy to development environment (default)
    staging      - Deploy to staging environment
    production   - Deploy to production environment

VERSION:
    latest       - Deploy latest version (default)
    <tag>        - Deploy specific version tag

Examples:
    $0                          # Deploy latest to development
    $0 staging                  # Deploy latest to staging
    $0 production v1.2.3        # Deploy v1.2.3 to production

Options:
    -h, --help                  # Show this help message
EOF
}

# Check if help is requested
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    show_help
    exit 0
fi

# Validate environment
case $ENVIRONMENT in
    development|staging|production)
        log_info "Deploying to $ENVIRONMENT environment"
        ;;
    *)
        log_error "Invalid environment: $ENVIRONMENT"
        log_error "Valid environments: development, staging, production"
        exit 1
        ;;
esac

# Pre-deployment checks
log_info "Running pre-deployment checks..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    log_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if required files exist
required_files=(
    "docker-compose.yml"
    "docker-compose.prod.yml"
    ".env.example"
)

for file in "${required_files[@]}"; do
    if [[ ! -f "$PROJECT_ROOT/$file" ]]; then
        log_error "Required file not found: $file"
        exit 1
    fi
done

log_success "Pre-deployment checks passed"

# Environment-specific configuration
case $ENVIRONMENT in
    development)
        COMPOSE_FILE="docker-compose.yml"
        ENV_FILE=".env"
        ;;
    staging)
        COMPOSE_FILE="docker-compose.prod.yml"
        ENV_FILE=".env.staging"
        ;;
    production)
        COMPOSE_FILE="docker-compose.prod.yml"
        ENV_FILE=".env.production"
        ;;
esac

# Check if environment file exists
if [[ ! -f "$PROJECT_ROOT/$ENV_FILE" ]]; then
    log_warning "Environment file not found: $ENV_FILE"
    if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
        log_info "Copying .env.example to $ENV_FILE"
        cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/$ENV_FILE"
        log_warning "Please update $ENV_FILE with appropriate values before deployment"
    else
        log_error "No environment file found and no .env.example to copy from"
        exit 1
    fi
fi

# Build and deploy
log_info "Building Docker images..."
cd "$PROJECT_ROOT"

# Set environment variables
export COMPOSE_FILE
export VERSION

# Build images
if ! docker-compose -f "$COMPOSE_FILE" build; then
    log_error "Failed to build Docker images"
    exit 1
fi

log_success "Docker images built successfully"

# Database migration
log_info "Running database migrations..."
if [[ -f "scripts/migrate.sh" ]]; then
    bash scripts/migrate.sh "$ENVIRONMENT"
else
    log_warning "No migration script found, skipping database migrations"
fi

# Deploy services
log_info "Deploying services..."
if ! docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d; then
    log_error "Failed to deploy services"
    exit 1
fi

log_success "Services deployed successfully"

# Wait for services to be ready
log_info "Waiting for services to be ready..."
sleep 30

# Health checks
log_info "Running health checks..."
if [[ -f "scripts/health-check.js" ]]; then
    if node scripts/health-check.js; then
        log_success "Health checks passed"
    else
        log_error "Health checks failed"
        exit 1
    fi
else
    log_warning "No health check script found, skipping health checks"
fi

# Post-deployment tasks
log_info "Running post-deployment tasks..."

# Seed data for development
if [[ "$ENVIRONMENT" == "development" ]]; then
    log_info "Seeding development data..."
    docker-compose -f "$COMPOSE_FILE" exec -T postgres psql -U postgres -d mentor_platform -f /docker-entrypoint-initdb.d/02-seed-data.sql || log_warning "Failed to seed data"
fi

# Clean up old images
log_info "Cleaning up old Docker images..."
docker image prune -f

log_success "Deployment completed successfully!"

# Display service URLs
log_info "Service URLs:"
case $ENVIRONMENT in
    development)
        echo "  Frontend: http://localhost:3001"
        echo "  API Gateway: http://localhost:3000"
        echo "  API Documentation: http://localhost:3000/api-docs"
        ;;
    staging)
        echo "  Frontend: https://staging.mentorplatform.com"
        echo "  API Gateway: https://api-staging.mentorplatform.com"
        ;;
    production)
        echo "  Frontend: https://mentorplatform.com"
        echo "  API Gateway: https://api.mentorplatform.com"
        ;;
esac

log_info "Deployment logs can be viewed with: docker-compose -f $COMPOSE_FILE logs -f"