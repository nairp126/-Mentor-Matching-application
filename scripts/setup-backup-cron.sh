#!/bin/bash

# Setup automated backup cron jobs for Mentor Matching Platform

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT=${1:-production}

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
Setup Backup Cron Jobs for Mentor Matching Platform

Usage: $0 [ENVIRONMENT]

ENVIRONMENT:
    development  - Setup development backup schedule
    staging      - Setup staging backup schedule  
    production   - Setup production backup schedule (default)

Examples:
    $0                    # Setup production backup schedule
    $0 staging           # Setup staging backup schedule

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
        log_info "Setting up backup cron jobs for $ENVIRONMENT environment"
        ;;
    *)
        log_error "Invalid environment: $ENVIRONMENT"
        log_error "Valid environments: development, staging, production"
        exit 1
        ;;
esac

cd "$PROJECT_ROOT"

# Create logs directory for cron jobs
mkdir -p logs/cron

# Define backup schedules based on environment
case $ENVIRONMENT in
    production)
        # Production: Every 6 hours for full backup, every hour for database
        FULL_BACKUP_SCHEDULE="0 */6 * * *"
        DB_BACKUP_SCHEDULE="0 * * * *"
        CONFIG_BACKUP_SCHEDULE="0 2 * * *"
        ;;
    staging)
        # Staging: Daily full backup, every 4 hours for database
        FULL_BACKUP_SCHEDULE="0 2 * * *"
        DB_BACKUP_SCHEDULE="0 */4 * * *"
        CONFIG_BACKUP_SCHEDULE="0 3 * * *"
        ;;
    development)
        # Development: Daily full backup, twice daily for database
        FULL_BACKUP_SCHEDULE="0 2 * * *"
        DB_BACKUP_SCHEDULE="0 2,14 * * *"
        CONFIG_BACKUP_SCHEDULE="0 3 * * *"
        ;;
esac

# Create cron job entries
CRON_FILE="/tmp/mentor_platform_cron_${ENVIRONMENT}"

cat > "$CRON_FILE" << EOF
# Mentor Matching Platform Automated Backups - $ENVIRONMENT Environment
# Generated on $(date)

# Full system backup
$FULL_BACKUP_SCHEDULE cd $PROJECT_ROOT && ./scripts/backup.sh $ENVIRONMENT full >> logs/cron/backup_full.log 2>&1

# Database backup
$DB_BACKUP_SCHEDULE cd $PROJECT_ROOT && ./scripts/backup.sh $ENVIRONMENT database >> logs/cron/backup_database.log 2>&1

# Configuration backup
$CONFIG_BACKUP_SCHEDULE cd $PROJECT_ROOT && ./scripts/backup.sh $ENVIRONMENT config >> logs/cron/backup_config.log 2>&1

# Backup cleanup (weekly)
0 1 * * 0 cd $PROJECT_ROOT && find backups -type d -name "*_${ENVIRONMENT}_*" -mtime +30 -exec rm -rf {} + >> logs/cron/backup_cleanup.log 2>&1

# Health check after backup (production only)
EOF

if [[ "$ENVIRONMENT" == "production" ]]; then
    cat >> "$CRON_FILE" << EOF
5 */6 * * * cd $PROJECT_ROOT && node scripts/health-check.js >> logs/cron/health_check.log 2>&1
EOF
fi

# Backup existing crontab
log_info "Backing up existing crontab..."
crontab -l > "/tmp/crontab_backup_$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true

# Install new cron jobs
log_info "Installing backup cron jobs..."

# Get existing crontab and filter out old mentor platform entries
EXISTING_CRON="/tmp/existing_cron"
crontab -l 2>/dev/null | grep -v "Mentor Matching Platform" | grep -v "mentor_platform" > "$EXISTING_CRON" || true

# Combine existing cron jobs with new ones
cat "$EXISTING_CRON" "$CRON_FILE" | crontab -

if [[ $? -eq 0 ]]; then
    log_success "Cron jobs installed successfully"
else
    log_error "Failed to install cron jobs"
    exit 1
fi

# Display installed cron jobs
log_info "Installed cron jobs:"
echo "----------------------------------------"
crontab -l | grep -A 20 "Mentor Matching Platform"
echo "----------------------------------------"

# Create log rotation configuration
log_info "Setting up log rotation for backup logs..."

LOGROTATE_CONFIG="/etc/logrotate.d/mentor-platform-backups"
sudo tee "$LOGROTATE_CONFIG" > /dev/null << EOF
$PROJECT_ROOT/logs/cron/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $(whoami) $(whoami)
    postrotate
        # Send log rotation notification if needed
        echo "Backup logs rotated on \$(date)" >> $PROJECT_ROOT/logs/cron/logrotate.log
    endscript
}
EOF

if [[ $? -eq 0 ]]; then
    log_success "Log rotation configured"
else
    log_warning "Failed to configure log rotation (may need sudo privileges)"
fi

# Create backup monitoring script
log_info "Creating backup monitoring script..."

MONITOR_SCRIPT="scripts/monitor-backups.sh"
cat > "$MONITOR_SCRIPT" << 'EOF'
#!/bin/bash

# Backup Monitoring Script
# Checks backup status and sends alerts if needed

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT=${1:-production}

cd "$PROJECT_ROOT"

# Check if backups are recent
BACKUP_DIR="backups"
ALERT_THRESHOLD_HOURS=8

if [[ ! -d "$BACKUP_DIR" ]]; then
    echo "ERROR: Backup directory not found"
    exit 1
fi

# Find most recent backup for environment
LATEST_BACKUP=$(ls -dt "$BACKUP_DIR"/*_${ENVIRONMENT}_* 2>/dev/null | head -1)

if [[ -z "$LATEST_BACKUP" ]]; then
    echo "ERROR: No backups found for environment: $ENVIRONMENT"
    exit 1
fi

# Check backup age
BACKUP_TIME=$(stat -c %Y "$LATEST_BACKUP" 2>/dev/null || stat -f %m "$LATEST_BACKUP" 2>/dev/null)
CURRENT_TIME=$(date +%s)
BACKUP_AGE_HOURS=$(( (CURRENT_TIME - BACKUP_TIME) / 3600 ))

if [[ $BACKUP_AGE_HOURS -gt $ALERT_THRESHOLD_HOURS ]]; then
    echo "WARNING: Latest backup is $BACKUP_AGE_HOURS hours old (threshold: $ALERT_THRESHOLD_HOURS hours)"
    echo "Latest backup: $LATEST_BACKUP"
    exit 1
else
    echo "OK: Latest backup is $BACKUP_AGE_HOURS hours old"
    echo "Latest backup: $LATEST_BACKUP"
    
    # Check backup size
    BACKUP_SIZE=$(du -sh "$LATEST_BACKUP" | cut -f1)
    echo "Backup size: $BACKUP_SIZE"
    
    # Check backup integrity
    if [[ -f "$LATEST_BACKUP/backup_metadata.json" ]]; then
        echo "Backup metadata: OK"
    else
        echo "WARNING: Backup metadata missing"
        exit 1
    fi
fi

exit 0
EOF

chmod +x "$MONITOR_SCRIPT"

# Add backup monitoring to cron
log_info "Adding backup monitoring to cron..."

MONITOR_CRON="/tmp/monitor_cron"
cat > "$MONITOR_CRON" << EOF

# Backup monitoring (every 2 hours)
0 */2 * * * cd $PROJECT_ROOT && ./scripts/monitor-backups.sh $ENVIRONMENT >> logs/cron/backup_monitor.log 2>&1
EOF

# Add monitoring cron job
(crontab -l 2>/dev/null; cat "$MONITOR_CRON") | crontab -

# Create backup status endpoint for health checks
log_info "Creating backup status endpoint..."

BACKUP_STATUS_SCRIPT="scripts/backup-status.js"
cat > "$BACKUP_STATUS_SCRIPT" << 'EOF'
#!/usr/bin/env node

// Backup Status Check for Health Monitoring
const fs = require('fs');
const path = require('path');

const environment = process.env.NODE_ENV || 'production';
const backupDir = path.join(__dirname, '..', 'backups');

function checkBackupStatus() {
    try {
        if (!fs.existsSync(backupDir)) {
            return {
                status: 'error',
                message: 'Backup directory not found',
                timestamp: new Date().toISOString()
            };
        }

        // Find latest backup for environment
        const backups = fs.readdirSync(backupDir)
            .filter(name => name.includes(`_${environment}_`))
            .map(name => {
                const fullPath = path.join(backupDir, name);
                const stats = fs.statSync(fullPath);
                return {
                    name,
                    path: fullPath,
                    mtime: stats.mtime,
                    size: stats.size
                };
            })
            .sort((a, b) => b.mtime - a.mtime);

        if (backups.length === 0) {
            return {
                status: 'error',
                message: `No backups found for environment: ${environment}`,
                timestamp: new Date().toISOString()
            };
        }

        const latestBackup = backups[0];
        const ageHours = (Date.now() - latestBackup.mtime.getTime()) / (1000 * 60 * 60);
        const alertThreshold = environment === 'production' ? 8 : 24;

        const status = {
            status: ageHours > alertThreshold ? 'warning' : 'ok',
            latestBackup: latestBackup.name,
            ageHours: Math.round(ageHours * 100) / 100,
            alertThreshold,
            backupCount: backups.length,
            timestamp: new Date().toISOString()
        };

        if (ageHours > alertThreshold) {
            status.message = `Latest backup is ${status.ageHours} hours old (threshold: ${alertThreshold} hours)`;
        } else {
            status.message = `Latest backup is ${status.ageHours} hours old`;
        }

        return status;
    } catch (error) {
        return {
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// If called directly, output JSON
if (require.main === module) {
    console.log(JSON.stringify(checkBackupStatus(), null, 2));
}

module.exports = { checkBackupStatus };
EOF

chmod +x "$BACKUP_STATUS_SCRIPT"

# Clean up temporary files
rm -f "$CRON_FILE" "$EXISTING_CRON" "$MONITOR_CRON"

log_success "Backup automation setup completed!"
log_info "Backup schedules for $ENVIRONMENT environment:"

case $ENVIRONMENT in
    production)
        echo "  - Full backup: Every 6 hours"
        echo "  - Database backup: Every hour"
        echo "  - Configuration backup: Daily at 2 AM"
        echo "  - Backup monitoring: Every 2 hours"
        ;;
    staging)
        echo "  - Full backup: Daily at 2 AM"
        echo "  - Database backup: Every 4 hours"
        echo "  - Configuration backup: Daily at 3 AM"
        echo "  - Backup monitoring: Every 2 hours"
        ;;
    development)
        echo "  - Full backup: Daily at 2 AM"
        echo "  - Database backup: Twice daily (2 AM, 2 PM)"
        echo "  - Configuration backup: Daily at 3 AM"
        echo "  - Backup monitoring: Every 2 hours"
        ;;
esac

echo ""
log_info "Log files location: $PROJECT_ROOT/logs/cron/"
log_info "Backup monitoring: ./scripts/monitor-backups.sh $ENVIRONMENT"
log_info "Backup status check: node ./scripts/backup-status.js"

log_warning "Make sure to test the backup and restore procedures regularly!"
log_info "To view current cron jobs: crontab -l"
log_info "To remove cron jobs: crontab -e (then delete the Mentor Matching Platform section)"