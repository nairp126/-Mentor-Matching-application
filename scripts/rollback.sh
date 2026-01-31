#!/bin/bash

# Rollback Script
# Handles rollback scenarios for failed deployments

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT=${1:-development}
TARGET_VERSION=${2}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

show_help() {
    cat << EOF
Mentor Matching Platform Rollback Script

Usage: $0 [ENVIRONMENT] [TARGET_VERSION]

ENVIRONMENT:
    development  - Rollback development environment (default)
    staging      - Rollback staging environment
    production   - Rollback production environment

TARGET_VERSION:
    If not specified, will rollback to the previous version

Examples:
    $0                          # Rollback development to previous version
    $0 production               # Rollback production to previous version
    $0 production v1.2.3        # Rollback production to specific version

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
        log_info "Rolling back $ENVIRONMENT environment"
        ;;
    *)
        log_error "Invalid environment: $ENVIRONMENT"
        log_error "Valid environments: development, staging, production"
        exit 1
        ;;
esac

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

cd "$PROJECT_ROOT"

# Create backup of current state
log_info "Creating backup of current deployment state..."
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)_${ENVIRONMENT}_rollback"
mkdir -p "$BACKUP_DIR"

# Backup current docker-compose state
docker-compose -f "$COMPOSE_FILE" config > "$BACKUP_DIR/docker-compose-backup.yml"

# Backup current environment file
if [[ -f "$ENV_FILE" ]]; then
    cp "$ENV_FILE" "$BACKUP_DIR/"
fi

# Export current container images list
docker-compose -f "$COMPOSE_FILE" images > "$BACKUP_DIR/current-images.txt"

log_success "Backup created in $BACKUP_DIR"

# Stop current services
log_info "Stopping current services..."
docker-compose -f "$COMPOSE_FILE" down

# Database rollback preparation
log_info "Preparing database rollback..."

# Create database backup before rollback
DB_BACKUP_FILE="$BACKUP_DIR/database_backup_$(date +%Y%m%d_%H%M%S).sql"
if docker ps -a | grep -q "postgres"; then
    POSTGRES_CONTAINER=$(docker ps -a --filter "name=postgres" --format "{{.Names}}" | head -1)
    log_info "Creating database backup..."
    docker exec "$POSTGRES_CONTAINER" pg_dump -U postgres mentor_platform > "$DB_BACKUP_FILE"
    log_success "Database backup created: $DB_BACKUP_FILE"
else
    log_warning "No PostgreSQL container found, skipping database backup"
fi

# Determine target version for rollback
if [[ -z "$TARGET_VERSION" ]]; then
    log_info "No target version specified, attempting to determine previous version..."
    
    # Try to get previous version from git tags
    if command -v git &> /dev/null && git rev-parse --git-dir > /dev/null 2>&1; then
        CURRENT_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
        if [[ -n "$CURRENT_TAG" ]]; then
            PREVIOUS_TAG=$(git describe --tags --abbrev=0 "$CURRENT_TAG^" 2>/dev/null || echo "")
            if [[ -n "$PREVIOUS_TAG" ]]; then
                TARGET_VERSION="$PREVIOUS_TAG"
                log_info "Found previous version: $TARGET_VERSION"
            fi
        fi
    fi
    
    # Fallback to 'previous' tag
    if [[ -z "$TARGET_VERSION" ]]; then
        TARGET_VERSION="previous"
        log_warning "Could not determine previous version, using 'previous' tag"
    fi
fi

# Pull target version images
log_info "Pulling target version images: $TARGET_VERSION"

# Update docker-compose to use target version
if [[ "$TARGET_VERSION" != "previous" ]]; then
    # Replace image tags in docker-compose file
    sed -i.bak "s/:latest/:$TARGET_VERSION/g" "$COMPOSE_FILE"
    sed -i.bak "s/:main/:$TARGET_VERSION/g" "$COMPOSE_FILE"
fi

# Pull images
if ! docker-compose -f "$COMPOSE_FILE" pull; then
    log_error "Failed to pull target version images"
    log_info "Restoring original docker-compose file..."
    if [[ -f "$COMPOSE_FILE.bak" ]]; then
        mv "$COMPOSE_FILE.bak" "$COMPOSE_FILE"
    fi
    exit 1
fi

# Start services with target version
log_info "Starting services with target version..."
if ! docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d; then
    log_error "Failed to start services with target version"
    
    # Attempt to restore from backup
    log_info "Attempting to restore from backup..."
    if [[ -f "$BACKUP_DIR/docker-compose-backup.yml" ]]; then
        cp "$BACKUP_DIR/docker-compose-backup.yml" "$COMPOSE_FILE"
        docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    fi
    exit 1
fi

# Wait for services to be ready
log_info "Waiting for services to be ready..."
sleep 30

# Run health checks
log_info "Running health checks..."
if [[ -f "scripts/health-check.js" ]]; then
    if node scripts/health-check.js; then
        log_success "Health checks passed"
    else
        log_error "Health checks failed after rollback"
        log_warning "Services may not be fully operational"
    fi
else
    log_warning "No health check script found, skipping health checks"
fi

# Clean up backup docker-compose file
if [[ -f "$COMPOSE_FILE.bak" ]]; then
    rm "$COMPOSE_FILE.bak"
fi

# Clean up old images
log_info "Cleaning up old Docker images..."
docker image prune -f

log_success "Rollback completed successfully!"
log_info "Rolled back to version: $TARGET_VERSION"
log_info "Backup location: $BACKUP_DIR"

# Display service URLs
log_info "Service URLs:"
case $ENVIRONMENT in
    development)
        echo "  Frontend: http://localhost:3001"
        echo "  API Gateway: http://localhost:3000"
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

log_warning "Please verify that all services are working correctly"
log_info "If issues persist, you can restore the database from: $DB_BACKUP_FILE"