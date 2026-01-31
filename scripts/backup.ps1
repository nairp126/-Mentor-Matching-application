# Backup Script for Mentor Matching Platform (PowerShell)
# Creates automated backups of database, files, and configurations

param(
    [string]$Environment = "development",
    [string]$BackupType = "full",
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
Mentor Matching Platform Backup Script (PowerShell)

Usage: .\backup.ps1 [-Environment <env>] [-BackupType <type>] [-Help]

Parameters:
    -Environment    development, staging, or production (default: development)
    -BackupType     full, database, files, or config (default: full)
    -Help           Show this help message

Examples:
    .\backup.ps1                                    # Full backup of development
    .\backup.ps1 -Environment production            # Full backup of production
    .\backup.ps1 -Environment production -BackupType database  # Database backup only
"@
}

if ($Help) {
    Show-Help
    exit 0
}

# Validate environment
if ($Environment -notin @("development", "staging", "production")) {
    Write-Log "Invalid environment: $Environment" "Error"
    Write-Log "Valid environments: development, staging, production" "Error"
    exit 1
}

# Validate backup type
if ($BackupType -notin @("full", "database", "files", "config")) {
    Write-Log "Invalid backup type: $BackupType" "Error"
    Write-Log "Valid types: full, database, files, config" "Error"
    exit 1
}

Write-Log "Creating backup for $Environment environment" "Info"
Write-Log "Backup type: $BackupType" "Info"

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

# Create backup directory
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "backups\${timestamp}_${Environment}_${BackupType}"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Write-Log "Backup directory: $backupDir" "Info"

# Database backup function
function Backup-Database {
    Write-Log "Creating database backup..." "Info"
    
    # Check if database container is running
    $containerRunning = docker ps --format "{{.Names}}" | Select-String $config.DbContainer
    if (-not $containerRunning) {
        Write-Log "Database container $($config.DbContainer) is not running" "Error"
        return $false
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
    
    # Create database dump
    $dbBackupFile = "$backupDir\database_${timestamp}.sql"
    $dumpResult = docker exec $config.DbContainer pg_dump -U $dbUser -d $dbName
    
    if ($LASTEXITCODE -eq 0) {
        $dumpResult | Out-File -FilePath $dbBackupFile -Encoding UTF8
        Write-Log "Database backup created: $dbBackupFile" "Success"
        
        # Compress the backup
        Compress-Archive -Path $dbBackupFile -DestinationPath "${dbBackupFile}.zip" -Force
        Remove-Item $dbBackupFile
        Write-Log "Database backup compressed: ${dbBackupFile}.zip" "Success"
        
        # Create database schema backup
        $schemaBackupFile = "$backupDir\schema_${timestamp}.sql"
        $schemaResult = docker exec $config.DbContainer pg_dump -U $dbUser -d $dbName --schema-only
        $schemaResult | Out-File -FilePath $schemaBackupFile -Encoding UTF8
        Compress-Archive -Path $schemaBackupFile -DestinationPath "${schemaBackupFile}.zip" -Force
        Remove-Item $schemaBackupFile
        Write-Log "Database schema backup created: ${schemaBackupFile}.zip" "Success"
        
        return $true
    } else {
        Write-Log "Failed to create database backup" "Error"
        return $false
    }
}

# Files backup function
function Backup-Files {
    Write-Log "Creating files backup..." "Info"
    
    # Backup uploaded files and user data
    $filesBackupDir = "$backupDir\files"
    New-Item -ItemType Directory -Path $filesBackupDir -Force | Out-Null
    
    # Backup Docker volumes
    Write-Log "Backing up Docker volumes..." "Info"
    
    # PostgreSQL data
    $volumeExists = docker volume ls --format "{{.Name}}" | Select-String "postgres_data"
    if ($volumeExists) {
        docker run --rm -v postgres_data:/data -v "${PWD}\${filesBackupDir}:/backup" alpine tar czf "/backup/postgres_data_${timestamp}.tar.gz" -C /data .
        if ($LASTEXITCODE -eq 0) {
            Write-Log "PostgreSQL data backed up" "Success"
        }
    }
    
    # Redis data
    $volumeExists = docker volume ls --format "{{.Name}}" | Select-String "redis_data"
    if ($volumeExists) {
        docker run --rm -v redis_data:/data -v "${PWD}\${filesBackupDir}:/backup" alpine tar czf "/backup/redis_data_${timestamp}.tar.gz" -C /data .
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Redis data backed up" "Success"
        }
    }
    
    # Elasticsearch data
    $volumeExists = docker volume ls --format "{{.Name}}" | Select-String "elasticsearch_data"
    if ($volumeExists) {
        docker run --rm -v elasticsearch_data:/data -v "${PWD}\${filesBackupDir}:/backup" alpine tar czf "/backup/elasticsearch_data_${timestamp}.tar.gz" -C /data .
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Elasticsearch data backed up" "Success"
        }
    }
    
    # Application logs
    if (Test-Path "logs") {
        Compress-Archive -Path "logs\*" -DestinationPath "$filesBackupDir\logs_${timestamp}.zip" -Force
        Write-Log "Application logs backed up" "Success"
    }
    
    # SSL certificates
    if (Test-Path "nginx\ssl") {
        Compress-Archive -Path "nginx\ssl\*" -DestinationPath "$filesBackupDir\ssl_${timestamp}.zip" -Force
        Write-Log "SSL certificates backed up" "Success"
    }
    
    Write-Log "Files backup completed" "Success"
    return $true
}

# Configuration backup function
function Backup-Config {
    Write-Log "Creating configuration backup..." "Info"
    
    $configBackupDir = "$backupDir\config"
    New-Item -ItemType Directory -Path $configBackupDir -Force | Out-Null
    
    # Backup environment files
    $envFiles = @(".env", ".env.example", ".env.production", ".env.staging")
    foreach ($envFile in $envFiles) {
        if (Test-Path $envFile) {
            Copy-Item $envFile $configBackupDir
            Write-Log "Backed up $envFile" "Info"
        }
    }
    
    # Backup Docker configurations
    Get-ChildItem -Path . -Name "docker-compose*.yml" | ForEach-Object {
        Copy-Item $_ $configBackupDir
    }
    
    # Backup nginx configuration
    if (Test-Path "nginx") {
        Copy-Item -Path "nginx" -Destination $configBackupDir -Recurse
        Write-Log "Backed up nginx configuration" "Info"
    }
    
    # Backup monitoring configuration
    if (Test-Path "monitoring") {
        Copy-Item -Path "monitoring" -Destination $configBackupDir -Recurse
        Write-Log "Backed up monitoring configuration" "Info"
    }
    
    # Backup database migrations
    if (Test-Path "database") {
        Copy-Item -Path "database" -Destination $configBackupDir -Recurse
        Write-Log "Backed up database migrations" "Info"
    }
    
    # Backup package files
    $packageFiles = @("package.json", "package-lock.json", "yarn.lock")
    foreach ($file in $packageFiles) {
        if (Test-Path $file) {
            Copy-Item $file $configBackupDir
            Write-Log "Backed up $file" "Info"
        }
    }
    
    Write-Log "Configuration backup completed" "Success"
    return $true
}

# Create backup metadata
function New-BackupMetadata {
    Write-Log "Creating backup metadata..." "Info"
    
    $metadataFile = "$backupDir\backup_metadata.json"
    
    $gitCommit = try { git rev-parse HEAD 2>$null } catch { "unknown" }
    $gitBranch = try { git branch --show-current 2>$null } catch { "unknown" }
    
    $metadata = @{
        backup_id = "${timestamp}_${Environment}_${BackupType}"
        timestamp = $timestamp
        environment = $Environment
        backup_type = $BackupType
        created_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        hostname = $env:COMPUTERNAME
        user = $env:USERNAME
        git_commit = $gitCommit
        git_branch = $gitBranch
        docker_compose_file = $config.ComposeFile
        environment_file = $config.EnvFile
    }
    
    $metadata | ConvertTo-Json -Depth 3 | Out-File -FilePath $metadataFile -Encoding UTF8
    Write-Log "Backup metadata created: $metadataFile" "Success"
}

# Validate backup integrity
function Test-BackupIntegrity {
    Write-Log "Validating backup integrity..." "Info"
    
    $validationPassed = $true
    
    # Check if backup directory exists and is not empty
    if (-not (Test-Path $backupDir) -or -not (Get-ChildItem $backupDir)) {
        Write-Log "Backup directory is empty or doesn't exist" "Error"
        $validationPassed = $false
    }
    
    # Validate database backup if it was created
    if ($BackupType -eq "full" -or $BackupType -eq "database") {
        $dbBackupFile = "$backupDir\database_${timestamp}.sql.zip"
        if (Test-Path $dbBackupFile) {
            try {
                $archive = [System.IO.Compression.ZipFile]::OpenRead($dbBackupFile)
                $archive.Dispose()
                Write-Log "Database backup validation passed" "Success"
            } catch {
                Write-Log "Database backup is corrupted" "Error"
                $validationPassed = $false
            }
        } else {
            Write-Log "Database backup file not found" "Error"
            $validationPassed = $false
        }
    }
    
    # Calculate backup size
    $backupSize = (Get-ChildItem $backupDir -Recurse | Measure-Object -Property Length -Sum).Sum
    $backupSizeMB = [math]::Round($backupSize / 1MB, 2)
    Write-Log "Backup size: ${backupSizeMB} MB" "Info"
    
    if ($validationPassed) {
        Write-Log "Backup validation passed" "Success"
        return $true
    } else {
        Write-Log "Backup validation failed" "Error"
        return $false
    }
}

# Cleanup old backups
function Remove-OldBackups {
    Write-Log "Cleaning up old backups..." "Info"
    
    $backupBaseDir = "backups"
    
    if (Test-Path $backupBaseDir) {
        # Remove backups older than 30 days
        $cutoffDate = (Get-Date).AddDays(-30)
        Get-ChildItem $backupBaseDir -Directory | Where-Object {
            $_.Name -match "_${Environment}_" -and $_.CreationTime -lt $cutoffDate
        } | Remove-Item -Recurse -Force
        
        # Keep only the latest 10 backups for this environment
        $backups = Get-ChildItem $backupBaseDir -Directory | Where-Object {
            $_.Name -match "_${Environment}_"
        } | Sort-Object CreationTime -Descending
        
        if ($backups.Count -gt 10) {
            $backups[10..($backups.Count-1)] | Remove-Item -Recurse -Force
        }
        
        Write-Log "Old backups cleaned up" "Success"
    }
}

# Main backup execution
function Start-Backup {
    Write-Log "Starting backup process..." "Info"
    
    $success = $true
    
    switch ($BackupType) {
        "full" {
            $success = (Backup-Database) -and (Backup-Files) -and (Backup-Config)
        }
        "database" {
            $success = Backup-Database
        }
        "files" {
            $success = Backup-Files
        }
        "config" {
            $success = Backup-Config
        }
    }
    
    if ($success) {
        New-BackupMetadata
        
        if (Test-BackupIntegrity) {
            Remove-OldBackups
            
            Write-Log "Backup completed successfully!" "Success"
            Write-Log "Backup location: $backupDir" "Info"
            
            $backupSize = (Get-ChildItem $backupDir -Recurse | Measure-Object -Property Length -Sum).Sum
            $backupSizeMB = [math]::Round($backupSize / 1MB, 2)
            Write-Log "Backup size: ${backupSizeMB} MB" "Info"
            
            # Create a symlink to the latest backup
            $latestLink = "backups\latest_${Environment}_${BackupType}"
            if (Test-Path $latestLink) {
                Remove-Item $latestLink -Force
            }
            New-Item -ItemType SymbolicLink -Path $latestLink -Target (Split-Path $backupDir -Leaf) -Force | Out-Null
            Write-Log "Latest backup symlink: $latestLink" "Info"
            
            exit 0
        } else {
            Write-Log "Backup validation failed" "Error"
            exit 1
        }
    } else {
        Write-Log "Backup process failed" "Error"
        exit 1
    }
}

# Handle Ctrl+C
$null = Register-EngineEvent PowerShell.Exiting -Action {
    Write-Log "Backup interrupted" "Error"
}

# Add required assembly for ZIP validation
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Run main function
Start-Backup