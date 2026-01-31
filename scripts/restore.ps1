# Restore Script for Mentor Matching Platform (PowerShell)
# Restores backups of database, files, and configurations

param(
    [string]$Environment = "development",
    [string]$BackupPath,
    [string]$RestoreType = "full",
    [switch]$Help
)

# Colors for output
$Colors = @{
    Red = "Red"
    Green = "Green"
    Yellow = "Yellow"
    Blue = "Blue"
    White = "White"
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "Info"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "Info" { $Colors.Blue }
        "Success" { $Colors.Green }
        "Warning" { $Colors.Yellow }
        "Error" { $Colors.Red }
        default { $Colors.White }
    }
    
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
}

function Show-Help {
    Write-Host @"
Mentor Matching Platform Restore Script (PowerShell)

Usage: .\restore.ps1 [-Environment <env>] [-BackupPath <path>] [-RestoreType <type>] [-Help]

Parameters:
    -Environment    development, staging, or production (default: development)
    -BackupPath     Path to backup directory or 'latest' for latest backup
    -RestoreType    full, database, files, or config (default: full)
    -Help           Show this help message

Examples:
    .\restore.ps1                                           # List available backups
    .\restore.ps1 -Environment development -BackupPath latest  # Restore latest development backup
    .\restore.ps1 -Environment production -BackupPath "backups\20240130_120000_production_full"  # Restore specific backup
    .\restore.ps1 -Environment production -BackupPath latest -RestoreType database  # Restore database only
"@
}

if ($Help) {
    Show-Help
    exit 0
}

# List available backups if no backup path specified
if (-not $BackupPath) {
    Write-Log "Available backups:" "Info"
    if (Test-Path "backups") {
        Get-ChildItem "backups" -Directory | Where-Object { $_.Name -match "_${Environment}_" } | 
            Sort-Object CreationTime -Descending | Select-Object -First 10 | 
            ForEach-Object { Write-Host "  $($_.Name)" }
        Write-Host ""
        Write-Log "Use 'latest' to restore the most recent backup, or specify a backup directory name" "Info"
    } else {
        Write-Log "No backups directory found" "Warning"
    }
    exit 0
}

# Validate environment
if ($Environment -notin @("development", "staging", "production")) {
    Write-Log "Invalid environment: $Environment" "Error"
    Write-Log "Valid environments: development, staging, production" "Error"
    exit 1
}

# Validate restore type
if ($RestoreType -notin @("full", "database", "files", "config")) {
    Write-Log "Invalid restore type: $RestoreType" "Error"
    Write-Log "Valid types: full, database, files, config" "Error"
    exit 1
}

Write-Log "Restoring to $Environment environment" "Info"
Write-Log "Restore type: $RestoreType" "Info"

# Environment-specific configuration
$config = switch ($Environment) {
    "development" {
        @{
            ComposeFile = "docker-compose.yml"
            EnvFile = ".env"
            DbContainer = "mentor-platform-postgres"
        }
    }
    "staging" {
        @{
            ComposeFile = "docker-compose.prod.yml"
            EnvFile = ".env.staging"
            DbContainer = "mentor-platform-postgres-prod"
        }
    }
    "production" {
        @{
            ComposeFile = "docker-compose.prod.yml"
            EnvFile = ".env.production"
            DbContainer = "mentor-platform-postgres-prod"
        }
    }
}

# Get project root directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

# Resolve backup path
if ($BackupPath -eq "latest") {
    $latestLink = "backups\latest_${Environment}_full"
    if (Test-Path $latestLink -PathType Container) {
        $backupDir = "backups\$(Get-Item $latestLink | Select-Object -ExpandProperty Target)"
    } else {
        # Find the most recent backup
        $backupDir = Get-ChildItem "backups" -Directory | Where-Object { $_.Name -match "_${Environment}_" } | 
                     Sort-Object CreationTime -Descending | Select-Object -First 1 | ForEach-Object { $_.FullName }
        if (-not $backupDir) {
            Write-Log "No backups found for environment: $Environment" "Error"
            exit 1
        }
    }
} else {
    $backupDir = $BackupPath
}

# Validate backup directory
if (-not (Test-Path $backupDir)) {
    Write-Log "Backup directory not found: $backupDir" "Error"
    exit 1
}

Write-Log "Restoring from: $backupDir" "Info"

# Validate backup metadata
$metadataFile = Join-Path $backupDir "backup_metadata.json"
if (Test-Path $metadataFile) {
    Write-Log "Backup metadata found, validating..." "Info"
    $metadata = Get-Content $metadataFile | ConvertFrom-Json
    if ($metadata.environment -ne $Environment) {
        Write-Log "Backup environment ($($metadata.environment)) doesn't match target environment ($Environment)" "Warning"
        $response = Read-Host "Continue anyway? (y/N)"
        if ($response -ne "y" -and $response -ne "Y") {
            Write-Log "Restore cancelled" "Info"
            exit 0
        }
    }
} else {
    Write-Log "No backup metadata found, proceeding with caution" "Warning"
}

# Create pre-restore backup
Write-Log "Creating pre-restore backup..." "Info"
$preRestoreDir = "backups\pre_restore_$(Get-Date -Format 'yyyyMMdd_HHmmss')_${Environment}"
New-Item -ItemType Directory -Path $preRestoreDir -Force | Out-Null

# Backup current state before restore
$containerRunning = docker ps --format "{{.Names}}" | Select-String $config.DbContainer
if ($containerRunning) {
    Write-Log "Backing up current database state..." "Info"
    
    # Load environment variables
    if (Test-Path $config.EnvFile) {
        Get-Content $config.EnvFile | ForEach-Object {
            if ($_ -match '^([^=]+)=(.*)$') {
                [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
            }
        }
    }
    
    $dbName = if ($env:DB_NAME) { $env:DB_NAME } else { "mentor_platform" }
    $dbUser = if ($env:DB_USER) { $env:DB_USER } else { "mentor_user" }
    
    $currentDbBackup = "$preRestoreDir\current_database.sql"
    $dumpResult = docker exec $config.DbContainer pg_dump -U $dbUser -d $dbName
    $dumpResult | Out-File -FilePath $currentDbBackup -Encoding UTF8
    Compress-Archive -Path $currentDbBackup -DestinationPath "${currentDbBackup}.zip" -Force
    Remove-Item $currentDbBackup
    Write-Log "Current database backed up to: ${currentDbBackup}.zip" "Success"
}

# Database restore function
function Restore-Database {
    Write-Log "Restoring database..." "Info"
    
    # Find database backup file
    $dbBackupFile = Get-ChildItem $backupDir -Filter "database_*.sql.zip" | Select-Object -First 1
    if (-not $dbBackupFile) {
        Write-Log "No database backup file found in $backupDir" "Error"
        return $false
    }
    
    Write-Log "Found database backup: $($dbBackupFile.FullName)" "Info"
    
    # Check if database container is running
    $containerRunning = docker ps --format "{{.Names}}" | Select-String $config.DbContainer
    if (-not $containerRunning) {
        Write-Log "Starting database container..." "Info"
        docker-compose -f $config.ComposeFile up -d postgres
        Start-Sleep 10
    }
    
    # Load environment variables
    if (Test-Path $config.EnvFile) {
        Get-Content $config.EnvFile | ForEach-Object {
            if ($_ -match '^([^=]+)=(.*)$') {
                [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
            }
        }
    }
    
    $dbName = if ($env:DB_NAME) { $env:DB_NAME } else { "mentor_platform" }
    $dbUser = if ($env:DB_USER) { $env:DB_USER } else { "mentor_user" }
    
    # Confirm database drop and recreate
    Write-Log "This will drop the existing database and recreate it" "Warning"
    $response = Read-Host "Continue? (y/N)"
    if ($response -ne "y" -and $response -ne "Y") {
        Write-Log "Database restore cancelled" "Info"
        return $false
    }
    
    # Stop all services that might be using the database
    Write-Log "Stopping services..." "Info"
    docker-compose -f $config.ComposeFile stop
    docker-compose -f $config.ComposeFile up -d postgres
    Start-Sleep 10
    
    # Drop and recreate database
    docker exec $config.DbContainer psql -U $dbUser -c "DROP DATABASE IF EXISTS $dbName;"
    docker exec $config.DbContainer psql -U $dbUser -c "CREATE DATABASE $dbName;"
    
    # Extract and restore database
    Write-Log "Restoring database from backup..." "Info"
    $tempSqlFile = [System.IO.Path]::GetTempFileName() + ".sql"
    Expand-Archive -Path $dbBackupFile.FullName -DestinationPath (Split-Path $tempSqlFile) -Force
    $extractedSqlFile = Get-ChildItem (Split-Path $tempSqlFile) -Filter "database_*.sql" | Select-Object -First 1
    
    if ($extractedSqlFile) {
        Get-Content $extractedSqlFile.FullName | docker exec -i $config.DbContainer psql -U $dbUser -d $dbName
        Remove-Item $extractedSqlFile.FullName -Force
        
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Database restored successfully" "Success"
            return $true
        } else {
            Write-Log "Database restore failed" "Error"
            return $false
        }
    } else {
        Write-Log "Failed to extract database backup" "Error"
        return $false
    }
}

# Files restore function
function Restore-Files {
    Write-Log "Restoring files..." "Info"
    
    $filesBackupDir = Join-Path $backupDir "files"
    if (-not (Test-Path $filesBackupDir)) {
        Write-Log "No files backup directory found in $backupDir" "Error"
        return $false
    }
    
    # Stop services before restoring volumes
    Write-Log "Stopping services for file restore..." "Info"
    docker-compose -f $config.ComposeFile down
    
    # Restore Docker volumes
    Write-Log "Restoring Docker volumes..." "Info"
    
    # PostgreSQL data
    $postgresBackup = Get-ChildItem $filesBackupDir -Filter "postgres_data_*.tar.gz" | Select-Object -First 1
    if ($postgresBackup) {
        Write-Log "Restoring PostgreSQL data from $($postgresBackup.Name)" "Info"
        docker volume rm postgres_data 2>$null
        docker volume create postgres_data
        docker run --rm -v postgres_data:/data -v "${PWD}\${filesBackupDir}:/backup" alpine tar xzf "/backup/$($postgresBackup.Name)" -C /data
        Write-Log "PostgreSQL data restored" "Success"
    }
    
    # Redis data
    $redisBackup = Get-ChildItem $filesBackupDir -Filter "redis_data_*.tar.gz" | Select-Object -First 1
    if ($redisBackup) {
        Write-Log "Restoring Redis data from $($redisBackup.Name)" "Info"
        docker volume rm redis_data 2>$null
        docker volume create redis_data
        docker run --rm -v redis_data:/data -v "${PWD}\${filesBackupDir}:/backup" alpine tar xzf "/backup/$($redisBackup.Name)" -C /data
        Write-Log "Redis data restored" "Success"
    }
    
    # Elasticsearch data
    $elasticsearchBackup = Get-ChildItem $filesBackupDir -Filter "elasticsearch_data_*.tar.gz" | Select-Object -First 1
    if ($elasticsearchBackup) {
        Write-Log "Restoring Elasticsearch data from $($elasticsearchBackup.Name)" "Info"
        docker volume rm elasticsearch_data 2>$null
        docker volume create elasticsearch_data
        docker run --rm -v elasticsearch_data:/data -v "${PWD}\${filesBackupDir}:/backup" alpine tar xzf "/backup/$($elasticsearchBackup.Name)" -C /data
        Write-Log "Elasticsearch data restored" "Success"
    }
    
    # Application logs
    $logsBackup = Get-ChildItem $filesBackupDir -Filter "logs_*.zip" | Select-Object -First 1
    if ($logsBackup) {
        Write-Log "Restoring application logs from $($logsBackup.Name)" "Info"
        if (Test-Path "logs") {
            Remove-Item "logs" -Recurse -Force
        }
        Expand-Archive -Path $logsBackup.FullName -DestinationPath "." -Force
        Write-Log "Application logs restored" "Success"
    }
    
    # SSL certificates
    $sslBackup = Get-ChildItem $filesBackupDir -Filter "ssl_*.zip" | Select-Object -First 1
    if ($sslBackup) {
        Write-Log "Restoring SSL certificates from $($sslBackup.Name)" "Info"
        if (Test-Path "nginx\ssl") {
            Remove-Item "nginx\ssl" -Recurse -Force
        }
        Expand-Archive -Path $sslBackup.FullName -DestinationPath "." -Force
        Write-Log "SSL certificates restored" "Success"
    }
    
    Write-Log "Files restore completed" "Success"
    return $true
}

# Configuration restore function
function Restore-Config {
    Write-Log "Restoring configuration..." "Info"
    
    $configBackupDir = Join-Path $backupDir "config"
    if (-not (Test-Path $configBackupDir)) {
        Write-Log "No config backup directory found in $backupDir" "Error"
        return $false
    }
    
    # Backup current configurations
    Write-Log "Backing up current configurations..." "Info"
    $preRestoreConfigDir = Join-Path $preRestoreDir "config"
    New-Item -ItemType Directory -Path $preRestoreConfigDir -Force | Out-Null
    
    @("nginx", "monitoring", "database") | ForEach-Object {
        if (Test-Path $_) {
            Copy-Item -Path $_ -Destination $preRestoreConfigDir -Recurse -Force
        }
    }
    
    @(".env", ".env.example", ".env.production", ".env.staging") | ForEach-Object {
        if (Test-Path $_) {
            Copy-Item -Path $_ -Destination $preRestoreConfigDir -Force
        }
    }
    
    Get-ChildItem -Filter "docker-compose*.yml" | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $preRestoreConfigDir -Force
    }
    
    # Confirm configuration restore
    Write-Log "This will overwrite current configuration files" "Warning"
    $response = Read-Host "Continue? (y/N)"
    if ($response -ne "y" -and $response -ne "Y") {
        Write-Log "Configuration restore cancelled" "Info"
        return $false
    }
    
    # Restore environment files
    @(".env", ".env.example", ".env.production", ".env.staging") | ForEach-Object {
        $sourceFile = Join-Path $configBackupDir $_
        if (Test-Path $sourceFile) {
            Copy-Item -Path $sourceFile -Destination . -Force
            Write-Log "Restored $_" "Info"
        }
    }
    
    # Restore Docker configurations
    Get-ChildItem $configBackupDir -Filter "docker-compose*.yml" | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination . -Force
    }
    
    # Restore nginx configuration
    $nginxConfigPath = Join-Path $configBackupDir "nginx"
    if (Test-Path $nginxConfigPath) {
        if (Test-Path "nginx") {
            Remove-Item "nginx" -Recurse -Force
        }
        Copy-Item -Path $nginxConfigPath -Destination . -Recurse -Force
        Write-Log "Restored nginx configuration" "Info"
    }
    
    # Restore monitoring configuration
    $monitoringConfigPath = Join-Path $configBackupDir "monitoring"
    if (Test-Path $monitoringConfigPath) {
        if (Test-Path "monitoring") {
            Remove-Item "monitoring" -Recurse -Force
        }
        Copy-Item -Path $monitoringConfigPath -Destination . -Recurse -Force
        Write-Log "Restored monitoring configuration" "Info"
    }
    
    # Restore database migrations
    $databaseConfigPath = Join-Path $configBackupDir "database"
    if (Test-Path $databaseConfigPath) {
        if (Test-Path "database") {
            Remove-Item "database" -Recurse -Force
        }
        Copy-Item -Path $databaseConfigPath -Destination . -Recurse -Force
        Write-Log "Restored database migrations" "Info"
    }
    
    # Restore package files
    @("package.json", "package-lock.json", "yarn.lock") | ForEach-Object {
        $sourceFile = Join-Path $configBackupDir $_
        if (Test-Path $sourceFile) {
            Copy-Item -Path $sourceFile -Destination . -Force
            Write-Log "Restored $_" "Info"
        }
    }
    
    Write-Log "Configuration restore completed" "Success"
    return $true
}

# Verify restore
function Test-Restore {
    Write-Log "Verifying restore..." "Info"
    
    # Start services
    Write-Log "Starting services..." "Info"
    docker-compose -f $config.ComposeFile --env-file $config.EnvFile up -d
    
    # Wait for services to be ready
    Write-Log "Waiting for services to be ready..." "Info"
    Start-Sleep 30
    
    # Run health checks
    if (Test-Path "scripts\health-check.js") {
        $healthCheckResult = node scripts\health-check.js
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Health checks passed - restore verification successful" "Success"
            return $true
        } else {
            Write-Log "Health checks failed - restore may have issues" "Error"
            return $false
        }
    } else {
        Write-Log "No health check script found, skipping verification" "Warning"
        return $true
    }
}

# Main restore execution
function Start-Restore {
    Write-Log "Starting restore process..." "Info"
    
    $success = $true
    
    switch ($RestoreType) {
        "full" {
            $success = (Restore-Database) -and (Restore-Files) -and (Restore-Config)
        }
        "database" {
            $success = Restore-Database
        }
        "files" {
            $success = Restore-Files
        }
        "config" {
            $success = Restore-Config
        }
    }
    
    if ($success) {
        if (Test-Restore) {
            Write-Log "Restore completed successfully!" "Success"
            Write-Log "Restored from: $backupDir" "Info"
            Write-Log "Pre-restore backup saved to: $preRestoreDir" "Info"
            
            # Display service URLs
            Write-Log "Service URLs:" "Info"
            switch ($Environment) {
                "development" {
                    Write-Host "  Frontend: http://localhost:3001"
                    Write-Host "  API Gateway: http://localhost:3000"
                }
                "staging" {
                    Write-Host "  Frontend: https://staging.mentorplatform.com"
                    Write-Host "  API Gateway: https://api-staging.mentorplatform.com"
                }
                "production" {
                    Write-Host "  Frontend: https://mentorplatform.com"
                    Write-Host "  API Gateway: https://api.mentorplatform.com"
                }
            }
            
            exit 0
        } else {
            Write-Log "Restore verification failed" "Error"
            exit 1
        }
    } else {
        Write-Log "Restore process failed" "Error"
        Write-Log "You can restore the previous state from: $preRestoreDir" "Info"
        exit 1
    }
}

# Handle Ctrl+C
$null = Register-EngineEvent PowerShell.Exiting -Action {
    Write-Log "Restore interrupted" "Error"
}

# Add required assembly for ZIP operations
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Run main function
Start-Restore