#!/bin/bash

# Restore Script for Mentor Matching Platform
# Restores backups of database, files, and configurations

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT=${1:-development}
BACKUP_PATH=${2}
RESTORE_TYPE=${3:-full}

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
Mentor Matching Platform Restore Script

Usage: $0 [ENVIRONMENT] [BACKUP_PATH] [RESTORE_TYPE]

ENVIRONMENT:
    development  - Restore to development environment (default)
    staging      - Restore to staging environment
    production   - Restore to production environment

BACKUP_PATH:
    Path to backup directory or 'latest' for latest backup
    If not specified, will list available backups

RESTORE_TYPE:
    full         - Full restore including database, files, and configs (default)
    database     - Database restore only
    files        - Files restore only
    config       - Configuration restore only

Examples:
    $0                                          # List available backups
    $0 development latest                       # Restore latest development backup
    $0 production backups/20240130_120000_production_full  # Restore specific backup
    $0 production latest database               # Restore database only

Options:
    -h, --help                                  # Show this help message
EOF
}

# Check if help is requested
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    show_help
    exit 0
fi

# List available backups if no backup path specified
if [[ -z "$BACKUP_PATH" ]]; then
    log_info "Available backups:"
    if [[ -d "backups" ]]; then
        ls -la backups/ | grep "^d" | grep "_${ENVIRONMENT}_" | awk '{print $9}' | sort -r | head -10
        echo ""
        log_info "Use 'latest' to restore the most recent backup, or specify a backup directory name"
    else
        log_warning "No backups directory found"
    fi
    exit 0
fi

# Validate environment
case $ENVIRONMENT in
    development|staging|production)
        log_info "Restoring to $ENVIRONMENT environment"
        ;;
    *)
        log_error "Invalid environment: $ENVIRONMENT"
        log_error "Valid environments: development, staging, production"
        exit 1
        ;;
esac

# Validate restore type
case $RESTORE_TYPE in
    full|database|files|config)
        log_info "Restore type: $RESTORE_TYPE"
        ;;
    *)
        log_error "Invalid restore type: $RESTORE_TYPE"
        log_error "Valid types: full, database, files, config"
        exit 1
        ;;
esac

# Environment-specific configuration
case $ENVIRONMENT in
    development)
        COMPOSE_FILE="docker-compose.yml"
        ENV_FILE=".env"
        DB_CONTAINER="mentor-platform-postgres"
        ;;
    staging)
        COMPOSE_FILE="docker-compose.prod.yml"
        ENV_FILE=".env.staging"
        DB_CONTAINER="mentor-platform-postgres-prod"
        ;;
    production)
        COMPOSE_FILE="docker-compose.prod.yml"
        ENV_FILE=".env.production"
        DB_CONTAINER="mentor-platform-postgres-prod"
        ;;
esac

cd "$PROJECT_ROOT"

# Resolve backup path
if [[ "$BACKUP_PATH" == "latest" ]]; then
    LATEST_LINK="backups/latest_${ENVIRONMENT}_full"
    if [[ -L "$LATEST_LINK" ]]; then
        BACKUP_DIR="backups/$(readlink "$LATEST_LINK")"
    else
        # Find the most recent backup
        BACKUP_DIR=$(ls -dt backups/*_${ENVIRONMENT}_* 2>/dev/null | head -1)
        if [[ -z "$BACKUP_DIR" ]]; then
            log_error "No backups found for environment: $ENVIRONMENT"
            exit 1
        fi
    fi
else
    BACKUP_DIR="$BACKUP_PATH"
fi

# Validate backup directory
if [[ ! -d "$BACKUP_DIR" ]]; then
    log_error "Backup directory not found: $BACKUP_DIR"
    exit 1
fi

log_info "Restoring from: $BACKUP_DIR"

# Validate backup metadata
METADATA_FILE="$BACKUP_DIR/backup_metadata.json"
if [[ -f "$METADATA_FILE" ]]; then
    log_info "Backup metadata found, validating..."
    BACKUP_ENV=$(grep -o '"environment": "[^"]*"' "$METADATA_FILE" | cut -d'"' -f4)
    if [[ "$BACKUP_ENV" != "$ENVIRONMENT" ]]; then
        log_warning "Backup environment ($BACKUP_ENV) doesn't match target environment ($ENVIRONMENT)"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Restore cancelled"
            exit 0
        fi
    fi
else
    log_warning "No backup metadata found, proceeding with caution"
fi

# Create pre-restore backup
log_info "Creating pre-restore backup..."
PRE_RESTORE_DIR="backups/pre_restore_$(date +%Y%m%d_%H%M%S)_${ENVIRONMENT}"
mkdir -p "$PRE_RESTORE_DIR"

# Backup current state before restore
if docker ps | grep -q "$DB_CONTAINER"; then
    log_info "Backing up current database state..."
    if [[ -f "$ENV_FILE" ]]; then
        source "$ENV_FILE"
    fi
    DB_NAME=${DB_NAME:-mentor_platform}
    DB_USER=${DB_USER:-mentor_user}
    
    docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$PRE_RESTORE_DIR/current_database.sql"
    gzip "$PRE_RESTORE_DIR/current_database.sql"
    log_success "Current database backed up to: $PRE_RESTORE_DIR/current_database.sql.gz"
fi

# Database restore function
restore_database() {
    log_info "Restoring database..."
    
    # Find database backup file
    DB_BACKUP_FILE=$(find "$BACKUP_DIR" -name "database_*.sql.gz" | head -1)
    if [[ -z "$DB_BACKUP_FILE" ]]; then
        log_error "No database backup file found in $BACKUP_DIR"
        return 1
    fi
    
    log_info "Found database backup: $DB_BACKUP_FILE"
    
    # Check if database container is running
    if ! docker ps | grep -q "$DB_CONTAINER"; then
        log_info "Starting database container..."
        docker-compose -f "$COMPOSE_FILE" up -d postgres
        sleep 10
    fi
    
    # Load environment variables
    if [[ -f "$ENV_FILE" ]]; then
        source "$ENV_FILE"
    fi
    
    DB_NAME=${DB_NAME:-mentor_platform}
    DB_USER=${DB_USER:-mentor_user}
    
    # Drop existing database and recreate
    log_warning "This will drop the existing database and recreate it"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Database restore cancelled"
        return 1
    fi
    
    # Stop all services that might be using the database
    log_info "Stopping services..."
    docker-compose -f "$COMPOSE_FILE" stop
    docker-compose -f "$COMPOSE_FILE" up -d postgres
    sleep 10
    
    # Drop and recreate database
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -c "DROP DATABASE IF EXISTS $DB_NAME;"
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;"
    
    # Restore database
    log_info "Restoring database from backup..."
    gunzip -c "$DB_BACKUP_FILE" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
    
    if [[ $? -eq 0 ]]; then
        log_success "Database restored successfully"
        return 0
    else
        log_error "Database restore failed"
        return 1
    fi
}

# Files restore function
restore_files() {
    log_info "Restoring files..."
    
    FILES_BACKUP_DIR="$BACKUP_DIR/files"
    if [[ ! -d "$FILES_BACKUP_DIR" ]]; then
        log_error "No files backup directory found in $BACKUP_DIR"
        return 1
    fi
    
    # Stop services before restoring volumes
    log_info "Stopping services for file restore..."
    docker-compose -f "$COMPOSE_FILE" down
    
    # Restore Docker volumes
    log_info "Restoring Docker volumes..."
    
    # PostgreSQL data
    if [[ -f "$FILES_BACKUP_DIR/postgres_data_"*.tar.gz ]]; then
        POSTGRES_BACKUP=$(ls "$FILES_BACKUP_DIR/postgres_data_"*.tar.gz | head -1)
        log_info "Restoring PostgreSQL data from $POSTGRES_BACKUP"
        docker volume rm postgres_data 2>/dev/null || true
        docker volume create postgres_data
        docker run --rm -v postgres_data:/data -v "$PWD/$FILES_BACKUP_DIR":/backup alpine tar xzf "/backup/$(basename "$POSTGRES_BACKUP")" -C /data
        log_success "PostgreSQL data restored"
    fi
    
    # Redis data
    if [[ -f "$FILES_BACKUP_DIR/redis_data_"*.tar.gz ]]; then
        REDIS_BACKUP=$(ls "$FILES_BACKUP_DIR/redis_data_"*.tar.gz | head -1)
        log_info "Restoring Redis data from $REDIS_BACKUP"
        docker volume rm redis_data 2>/dev/null || true
        docker volume create redis_data
        docker run --rm -v redis_data:/data -v "$PWD/$FILES_BACKUP_DIR":/backup alpine tar xzf "/backup/$(basename "$REDIS_BACKUP")" -C /data
        log_success "Redis data restored"
    fi
    
    # Elasticsearch data
    if [[ -f "$FILES_BACKUP_DIR/elasticsearch_data_"*.tar.gz ]]; then
        ELASTICSEARCH_BACKUP=$(ls "$FILES_BACKUP_DIR/elasticsearch_data_"*.tar.gz | head -1)
        log_info "Restoring Elasticsearch data from $ELASTICSEARCH_BACKUP"
        docker volume rm elasticsearch_data 2>/dev/null || true
        docker volume create elasticsearch_data
        docker run --rm -v elasticsearch_data:/data -v "$PWD/$FILES_BACKUP_DIR":/backup alpine tar xzf "/backup/$(basename "$ELASTICSEARCH_BACKUP")" -C /data
        log_success "Elasticsearch data restored"
    fi
    
    # Application logs
    if [[ -f "$FILES_BACKUP_DIR/logs_"*.tar.gz ]]; then
        LOGS_BACKUP=$(ls "$FILES_BACKUP_DIR/logs_"*.tar.gz | head -1)
        log_info "Restoring application logs from $LOGS_BACKUP"
        rm -rf logs/
        tar xzf "$LOGS_BACKUP"
        log_success "Application logs restored"
    fi
    
    # SSL certificates
    if [[ -f "$FILES_BACKUP_DIR/ssl_"*.tar.gz ]]; then
        SSL_BACKUP=$(ls "$FILES_BACKUP_DIR/ssl_"*.tar.gz | head -1)
        log_info "Restoring SSL certificates from $SSL_BACKUP"
        rm -rf nginx/ssl/
        tar xzf "$SSL_BACKUP"
        log_success "SSL certificates restored"
    fi
    
    log_success "Files restore completed"
    return 0
}

# Configuration restore function
restore_config() {
    log_info "Restoring configuration..."
    
    CONFIG_BACKUP_DIR="$BACKUP_DIR/config"
    if [[ ! -d "$CONFIG_BACKUP_DIR" ]]; then
        log_error "No config backup directory found in $BACKUP_DIR"
        return 1
    fi
    
    # Backup current configurations
    log_info "Backing up current configurations..."
    mkdir -p "$PRE_RESTORE_DIR/config"
    cp -r nginx "$PRE_RESTORE_DIR/config/" 2>/dev/null || true
    cp -r monitoring "$PRE_RESTORE_DIR/config/" 2>/dev/null || true
    cp -r database "$PRE_RESTORE_DIR/config/" 2>/dev/null || true
    cp .env* "$PRE_RESTORE_DIR/config/" 2>/dev/null || true
    cp docker-compose*.yml "$PRE_RESTORE_DIR/config/" 2>/dev/null || true
    
    # Restore configurations
    log_warning "This will overwrite current configuration files"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Configuration restore cancelled"
        return 1
    fi
    
    # Restore environment files
    for env_file in .env .env.example .env.production .env.staging; do
        if [[ -f "$CONFIG_BACKUP_DIR/$env_file" ]]; then
            cp "$CONFIG_BACKUP_DIR/$env_file" .
            log_info "Restored $env_file"
        fi
    done
    
    # Restore Docker configurations
    cp "$CONFIG_BACKUP_DIR"/docker-compose*.yml . 2>/dev/null || true
    
    # Restore nginx configuration
    if [[ -d "$CONFIG_BACKUP_DIR/nginx" ]]; then
        rm -rf nginx/
        cp -r "$CONFIG_BACKUP_DIR/nginx" .
        log_info "Restored nginx configuration"
    fi
    
    # Restore monitoring configuration
    if [[ -d "$CONFIG_BACKUP_DIR/monitoring" ]]; then
        rm -rf monitoring/
        cp -r "$CONFIG_BACKUP_DIR/monitoring" .
        log_info "Restored monitoring configuration"
    fi
    
    # Restore database migrations
    if [[ -d "$CONFIG_BACKUP_DIR/database" ]]; then
        rm -rf database/
        cp -r "$CONFIG_BACKUP_DIR/database" .
        log_info "Restored database migrations"
    fi
    
    # Restore package files
    for file in package.json package-lock.json yarn.lock; do
        if [[ -f "$CONFIG_BACKUP_DIR/$file" ]]; then
            cp "$CONFIG_BACKUP_DIR/$file" .
            log_info "Restored $file"
        fi
    done
    
    log_success "Configuration restore completed"
    return 0
}

# Verify restore
verify_restore() {
    log_info "Verifying restore..."
    
    # Start services
    log_info "Starting services..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 30
    
    # Run health checks
    if [[ -f "scripts/health-check.js" ]]; then
        if node scripts/health-check.js; then
            log_success "Health checks passed - restore verification successful"
            return 0
        else
            log_error "Health checks failed - restore may have issues"
            return 1
        fi
    else
        log_warning "No health check script found, skipping verification"
        return 0
    fi
}

# Main restore execution
main() {
    log_info "Starting restore process..."
    
    case $RESTORE_TYPE in
        full)
            restore_database && restore_files && restore_config
            ;;
        database)
            restore_database
            ;;
        files)
            restore_files
            ;;
        config)
            restore_config
            ;;
    esac
    
    if [[ $? -eq 0 ]]; then
        if verify_restore; then
            log_success "Restore completed successfully!"
            log_info "Restored from: $BACKUP_DIR"
            log_info "Pre-restore backup saved to: $PRE_RESTORE_DIR"
            
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
            
            exit 0
        else
            log_error "Restore verification failed"
            exit 1
        fi
    else
        log_error "Restore process failed"
        log_info "You can restore the previous state from: $PRE_RESTORE_DIR"
        exit 1
    fi
}

# Handle signals
trap 'log_error "Restore interrupted"; exit 1' INT TERM

# Run main function
main