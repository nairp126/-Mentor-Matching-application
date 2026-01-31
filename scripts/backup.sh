#!/bin/bash

# Backup Script for Mentor Matching Platform
# Creates automated backups of database, files, and configurations

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT=${1:-development}
BACKUP_TYPE=${2:-full}

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
Mentor Matching Platform Backup Script

Usage: $0 [ENVIRONMENT] [BACKUP_TYPE]

ENVIRONMENT:
    development  - Backup development environment (default)
    staging      - Backup staging environment
    production   - Backup production environment

BACKUP_TYPE:
    full         - Full backup including database, files, and configs (default)
    database     - Database backup only
    files        - Files backup only
    config       - Configuration backup only

Examples:
    $0                          # Full backup of development
    $0 production               # Full backup of production
    $0 production database      # Database backup only for production

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
        log_info "Creating backup for $ENVIRONMENT environment"
        ;;
    *)
        log_error "Invalid environment: $ENVIRONMENT"
        log_error "Valid environments: development, staging, production"
        exit 1
        ;;
esac

# Validate backup type
case $BACKUP_TYPE in
    full|database|files|config)
        log_info "Backup type: $BACKUP_TYPE"
        ;;
    *)
        log_error "Invalid backup type: $BACKUP_TYPE"
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

# Create backup directory
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups/${TIMESTAMP}_${ENVIRONMENT}_${BACKUP_TYPE}"
mkdir -p "$BACKUP_DIR"

log_info "Backup directory: $BACKUP_DIR"

# Database backup function
backup_database() {
    log_info "Creating database backup..."
    
    # Check if database container is running
    if ! docker ps | grep -q "$DB_CONTAINER"; then
        log_error "Database container $DB_CONTAINER is not running"
        return 1
    fi
    
    # Load environment variables
    if [[ -f "$ENV_FILE" ]]; then
        source "$ENV_FILE"
    fi
    
    DB_NAME=${DB_NAME:-mentor_platform}
    DB_USER=${DB_USER:-mentor_user}
    
    # Create database dump
    DB_BACKUP_FILE="$BACKUP_DIR/database_${TIMESTAMP}.sql"
    if docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$DB_BACKUP_FILE"; then
        log_success "Database backup created: $DB_BACKUP_FILE"
        
        # Compress the backup
        gzip "$DB_BACKUP_FILE"
        log_success "Database backup compressed: ${DB_BACKUP_FILE}.gz"
        
        # Create database schema backup
        SCHEMA_BACKUP_FILE="$BACKUP_DIR/schema_${TIMESTAMP}.sql"
        docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --schema-only > "$SCHEMA_BACKUP_FILE"
        gzip "$SCHEMA_BACKUP_FILE"
        log_success "Database schema backup created: ${SCHEMA_BACKUP_FILE}.gz"
        
        return 0
    else
        log_error "Failed to create database backup"
        return 1
    fi
}

# Files backup function
backup_files() {
    log_info "Creating files backup..."
    
    # Backup uploaded files and user data
    FILES_BACKUP_DIR="$BACKUP_DIR/files"
    mkdir -p "$FILES_BACKUP_DIR"
    
    # Backup Docker volumes
    log_info "Backing up Docker volumes..."
    
    # PostgreSQL data
    if docker volume ls | grep -q "postgres_data"; then
        docker run --rm -v postgres_data:/data -v "$PWD/$FILES_BACKUP_DIR":/backup alpine tar czf /backup/postgres_data_${TIMESTAMP}.tar.gz -C /data .
        log_success "PostgreSQL data backed up"
    fi
    
    # Redis data
    if docker volume ls | grep -q "redis_data"; then
        docker run --rm -v redis_data:/data -v "$PWD/$FILES_BACKUP_DIR":/backup alpine tar czf /backup/redis_data_${TIMESTAMP}.tar.gz -C /data .
        log_success "Redis data backed up"
    fi
    
    # Elasticsearch data
    if docker volume ls | grep -q "elasticsearch_data"; then
        docker run --rm -v elasticsearch_data:/data -v "$PWD/$FILES_BACKUP_DIR":/backup alpine tar czf /backup/elasticsearch_data_${TIMESTAMP}.tar.gz -C /data .
        log_success "Elasticsearch data backed up"
    fi
    
    # Application logs
    if [[ -d "logs" ]]; then
        tar czf "$FILES_BACKUP_DIR/logs_${TIMESTAMP}.tar.gz" logs/
        log_success "Application logs backed up"
    fi
    
    # SSL certificates
    if [[ -d "nginx/ssl" ]]; then
        tar czf "$FILES_BACKUP_DIR/ssl_${TIMESTAMP}.tar.gz" nginx/ssl/
        log_success "SSL certificates backed up"
    fi
    
    log_success "Files backup completed"
}

# Configuration backup function
backup_config() {
    log_info "Creating configuration backup..."
    
    CONFIG_BACKUP_DIR="$BACKUP_DIR/config"
    mkdir -p "$CONFIG_BACKUP_DIR"
    
    # Backup environment files
    for env_file in .env .env.example .env.production .env.staging; do
        if [[ -f "$env_file" ]]; then
            cp "$env_file" "$CONFIG_BACKUP_DIR/"
            log_info "Backed up $env_file"
        fi
    done
    
    # Backup Docker configurations
    cp docker-compose*.yml "$CONFIG_BACKUP_DIR/" 2>/dev/null || true
    
    # Backup nginx configuration
    if [[ -d "nginx" ]]; then
        cp -r nginx "$CONFIG_BACKUP_DIR/"
        log_info "Backed up nginx configuration"
    fi
    
    # Backup monitoring configuration
    if [[ -d "monitoring" ]]; then
        cp -r monitoring "$CONFIG_BACKUP_DIR/"
        log_info "Backed up monitoring configuration"
    fi
    
    # Backup database migrations
    if [[ -d "database" ]]; then
        cp -r database "$CONFIG_BACKUP_DIR/"
        log_info "Backed up database migrations"
    fi
    
    # Backup package.json and lock files
    for file in package.json package-lock.json yarn.lock; do
        if [[ -f "$file" ]]; then
            cp "$file" "$CONFIG_BACKUP_DIR/"
            log_info "Backed up $file"
        fi
    done
    
    log_success "Configuration backup completed"
}

# Create backup metadata
create_metadata() {
    log_info "Creating backup metadata..."
    
    METADATA_FILE="$BACKUP_DIR/backup_metadata.json"
    
    cat > "$METADATA_FILE" << EOF
{
  "backup_id": "${TIMESTAMP}_${ENVIRONMENT}_${BACKUP_TYPE}",
  "timestamp": "$TIMESTAMP",
  "environment": "$ENVIRONMENT",
  "backup_type": "$BACKUP_TYPE",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "$(hostname)",
  "user": "$(whoami)",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
  "docker_compose_file": "$COMPOSE_FILE",
  "environment_file": "$ENV_FILE"
}
EOF
    
    log_success "Backup metadata created: $METADATA_FILE"
}

# Validate backup integrity
validate_backup() {
    log_info "Validating backup integrity..."
    
    local validation_passed=true
    
    # Check if backup directory exists and is not empty
    if [[ ! -d "$BACKUP_DIR" ]] || [[ -z "$(ls -A "$BACKUP_DIR")" ]]; then
        log_error "Backup directory is empty or doesn't exist"
        validation_passed=false
    fi
    
    # Validate database backup if it was created
    if [[ "$BACKUP_TYPE" == "full" || "$BACKUP_TYPE" == "database" ]]; then
        if [[ -f "$BACKUP_DIR/database_${TIMESTAMP}.sql.gz" ]]; then
            # Test if the compressed file is valid
            if gzip -t "$BACKUP_DIR/database_${TIMESTAMP}.sql.gz"; then
                log_success "Database backup validation passed"
            else
                log_error "Database backup is corrupted"
                validation_passed=false
            fi
        else
            log_error "Database backup file not found"
            validation_passed=false
        fi
    fi
    
    # Calculate backup size
    BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
    log_info "Backup size: $BACKUP_SIZE"
    
    if [[ "$validation_passed" == true ]]; then
        log_success "Backup validation passed"
        return 0
    else
        log_error "Backup validation failed"
        return 1
    fi
}

# Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up old backups..."
    
    # Keep last 7 daily backups, 4 weekly backups, and 12 monthly backups
    BACKUP_BASE_DIR="backups"
    
    if [[ -d "$BACKUP_BASE_DIR" ]]; then
        # Remove backups older than 30 days
        find "$BACKUP_BASE_DIR" -type d -name "*_${ENVIRONMENT}_*" -mtime +30 -exec rm -rf {} + 2>/dev/null || true
        
        # Keep only the latest 10 backups for this environment
        ls -dt "$BACKUP_BASE_DIR"/*_${ENVIRONMENT}_* 2>/dev/null | tail -n +11 | xargs rm -rf 2>/dev/null || true
        
        log_success "Old backups cleaned up"
    fi
}

# Main backup execution
main() {
    log_info "Starting backup process..."
    
    case $BACKUP_TYPE in
        full)
            backup_database && backup_files && backup_config
            ;;
        database)
            backup_database
            ;;
        files)
            backup_files
            ;;
        config)
            backup_config
            ;;
    esac
    
    if [[ $? -eq 0 ]]; then
        create_metadata
        
        if validate_backup; then
            cleanup_old_backups
            
            log_success "Backup completed successfully!"
            log_info "Backup location: $BACKUP_DIR"
            log_info "Backup size: $(du -sh "$BACKUP_DIR" | cut -f1)"
            
            # Create a symlink to the latest backup
            LATEST_LINK="backups/latest_${ENVIRONMENT}_${BACKUP_TYPE}"
            rm -f "$LATEST_LINK"
            ln -s "$(basename "$BACKUP_DIR")" "$LATEST_LINK"
            log_info "Latest backup symlink: $LATEST_LINK"
            
            exit 0
        else
            log_error "Backup validation failed"
            exit 1
        fi
    else
        log_error "Backup process failed"
        exit 1
    fi
}

# Handle signals
trap 'log_error "Backup interrupted"; exit 1' INT TERM

# Run main function
main