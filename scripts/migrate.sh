#!/bin/bash

# Database Migration Script
# This script handles database migrations for different environments

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT=${1:-development}

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
Database Migration Script

Usage: $0 [ENVIRONMENT]

ENVIRONMENT:
    development  - Run migrations on development database (default)
    staging      - Run migrations on staging database
    production   - Run migrations on production database

Examples:
    $0                    # Migrate development database
    $0 staging            # Migrate staging database
    $0 production         # Migrate production database

Options:
    -h, --help           # Show this help message
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
        log_info "Running migrations for $ENVIRONMENT environment"
        ;;
    *)
        log_error "Invalid environment: $ENVIRONMENT"
        log_error "Valid environments: development, staging, production"
        exit 1
        ;;
esac

# Load environment variables
cd "$PROJECT_ROOT"

case $ENVIRONMENT in
    development)
        ENV_FILE=".env"
        ;;
    staging)
        ENV_FILE=".env.staging"
        ;;
    production)
        ENV_FILE=".env.production"
        ;;
esac

if [[ -f "$ENV_FILE" ]]; then
    log_info "Loading environment from $ENV_FILE"
    export $(grep -v '^#' "$ENV_FILE" | xargs)
else
    log_error "Environment file not found: $ENV_FILE"
    exit 1
fi

# Database connection parameters
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-mentor_platform}
DB_USER=${DB_USER:-mentor_user}

# Check if database is accessible
log_info "Checking database connectivity..."
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; then
    log_error "Cannot connect to database at $DB_HOST:$DB_PORT"
    log_error "Please ensure the database is running and accessible"
    exit 1
fi

log_success "Database connection established"

# Create migrations table if it doesn't exist
log_info "Creating migrations tracking table..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);" > /dev/null

# Get list of applied migrations
APPLIED_MIGRATIONS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT version FROM schema_migrations ORDER BY version;")

# Find migration files
MIGRATION_DIR="$PROJECT_ROOT/database/migrations"
if [[ ! -d "$MIGRATION_DIR" ]]; then
    log_error "Migration directory not found: $MIGRATION_DIR"
    exit 1
fi

# Get list of migration files
MIGRATION_FILES=($(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort))

if [[ ${#MIGRATION_FILES[@]} -eq 0 ]]; then
    log_warning "No migration files found in $MIGRATION_DIR"
    exit 0
fi

log_info "Found ${#MIGRATION_FILES[@]} migration files"

# Apply migrations
APPLIED_COUNT=0
SKIPPED_COUNT=0

for migration_file in "${MIGRATION_FILES[@]}"; do
    # Extract version from filename (e.g., 001-create-tables.sql -> 001)
    filename=$(basename "$migration_file")
    version=$(echo "$filename" | cut -d'-' -f1)
    
    # Check if migration is already applied
    if echo "$APPLIED_MIGRATIONS" | grep -q "^[[:space:]]*$version[[:space:]]*$"; then
        log_info "Skipping migration $version (already applied): $filename"
        ((SKIPPED_COUNT++))
        continue
    fi
    
    log_info "Applying migration $version: $filename"
    
    # Apply migration in a transaction
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 << EOF
BEGIN;
\i $migration_file
INSERT INTO schema_migrations (version) VALUES ('$version');
COMMIT;
EOF
    then
        log_success "Migration $version applied successfully"
        ((APPLIED_COUNT++))
    else
        log_error "Failed to apply migration $version"
        log_error "Migration stopped at: $filename"
        exit 1
    fi
done

# Summary
log_info "Migration summary:"
log_info "  Applied: $APPLIED_COUNT"
log_info "  Skipped: $SKIPPED_COUNT"
log_info "  Total: ${#MIGRATION_FILES[@]}"

if [[ $APPLIED_COUNT -gt 0 ]]; then
    log_success "Database migrations completed successfully!"
else
    log_info "No new migrations to apply"
fi

# Verify database schema
log_info "Verifying database schema..."
TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
log_info "Database contains $TABLE_COUNT tables"

log_success "Migration process completed"