# Setup automated backup scheduled tasks for Mentor Matching Platform (PowerShell)

param(
    [string]$Environment = "production",
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
Setup Backup Scheduled Tasks for Mentor Matching Platform (PowerShell)

Usage: .\setup-backup-cron.ps1 [-Environment <env>] [-Help]

Parameters:
    -Environment    development, staging, or production (default: production)
    -Help           Show this help message

Examples:
    .\setup-backup-cron.ps1                    # Setup production backup schedule
    .\setup-backup-cron.ps1 -Environment staging  # Setup staging backup schedule
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

Write-Log "Setting up backup scheduled tasks for $Environment environment" "Info"

# Get project root directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

# Create logs directory for scheduled tasks
New-Item -ItemType Directory -Path "logs\scheduled-tasks" -Force | Out-Null

# Define backup schedules based on environment
$schedules = switch ($Environment) {
    "production" {
        @{
            FullBackup = @{
                Frequency = "Daily"
                Interval = 4  # Every 4 hours
                StartTime = "02:00"
            }
            DatabaseBackup = @{
                Frequency = "Hourly"
                Interval = 1
                StartTime = "00:00"
            }
            ConfigBackup = @{
                Frequency = "Daily"
                Interval = 1
                StartTime = "02:30"
            }
        }
    }
    "staging" {
        @{
            FullBackup = @{
                Frequency = "Daily"
                Interval = 1
                StartTime = "02:00"
            }
            DatabaseBackup = @{
                Frequency = "Daily"
                Interval = 4  # Every 4 hours
                StartTime = "00:00"
            }
            ConfigBackup = @{
                Frequency = "Daily"
                Interval = 1
                StartTime = "03:00"
            }
        }
    }
    "development" {
        @{
            FullBackup = @{
                Frequency = "Daily"
                Interval = 1
                StartTime = "02:00"
            }
            DatabaseBackup = @{
                Frequency = "Daily"
                Interval = 12  # Twice daily
                StartTime = "02:00"
            }
            ConfigBackup = @{
                Frequency = "Daily"
                Interval = 1
                StartTime = "03:00"
            }
        }
    }
}

# Function to create scheduled task
function New-BackupScheduledTask {
    param(
        [string]$TaskName,
        [string]$BackupType,
        [hashtable]$Schedule,
        [string]$Environment
    )
    
    $taskPath = "\MentorPlatform\Backups"
    $fullTaskName = "$taskPath\$TaskName"
    
    # Create the task folder if it doesn't exist
    try {
        $null = Get-ScheduledTask -TaskPath $taskPath -ErrorAction Stop
    } catch {
        $null = New-ScheduledTaskFolder -TaskPath $taskPath -Force
    }
    
    # Define the action
    $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -File `"$projectRoot\scripts\backup.ps1`" -Environment $Environment -BackupType $BackupType" -WorkingDirectory $projectRoot
    
    # Define the trigger based on frequency
    if ($Schedule.Frequency -eq "Hourly") {
        $trigger = New-ScheduledTaskTrigger -Once -At $Schedule.StartTime -RepetitionInterval (New-TimeSpan -Hours $Schedule.Interval) -RepetitionDuration (New-TimeSpan -Days 365)
    } elseif ($Schedule.Frequency -eq "Daily" -and $Schedule.Interval -gt 1) {
        # For intervals like every 4 hours
        $trigger = New-ScheduledTaskTrigger -Once -At $Schedule.StartTime -RepetitionInterval (New-TimeSpan -Hours $Schedule.Interval) -RepetitionDuration (New-TimeSpan -Days 365)
    } else {
        # Daily
        $trigger = New-ScheduledTaskTrigger -Daily -At $Schedule.StartTime
    }
    
    # Define settings
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable
    
    # Define principal (run as current user)
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
    
    # Register the task
    try {
        # Remove existing task if it exists
        Unregister-ScheduledTask -TaskName $TaskName -TaskPath $taskPath -Confirm:$false -ErrorAction SilentlyContinue
        
        # Register new task
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -TaskPath $taskPath -Description "Automated backup for Mentor Matching Platform ($Environment environment)"
        
        Write-Log "Created scheduled task: $fullTaskName" "Success"
        return $true
    } catch {
        Write-Log "Failed to create scheduled task: $fullTaskName - $($_.Exception.Message)" "Error"
        return $false
    }
}

# Create backup scheduled tasks
Write-Log "Creating backup scheduled tasks..." "Info"

$tasksCreated = 0

# Full backup task
if (New-BackupScheduledTask -TaskName "FullBackup_$Environment" -BackupType "full" -Schedule $schedules.FullBackup -Environment $Environment) {
    $tasksCreated++
}

# Database backup task
if (New-BackupScheduledTask -TaskName "DatabaseBackup_$Environment" -BackupType "database" -Schedule $schedules.DatabaseBackup -Environment $Environment) {
    $tasksCreated++
}

# Configuration backup task
if (New-BackupScheduledTask -TaskName "ConfigBackup_$Environment" -BackupType "config" -Schedule $schedules.ConfigBackup -Environment $Environment) {
    $tasksCreated++
}

# Create backup cleanup task (weekly)
$cleanupAction = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -Command `"Get-ChildItem '$projectRoot\backups' -Directory | Where-Object { `$_.Name -match '_$Environment`_' -and `$_.CreationTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Recurse -Force`"" -WorkingDirectory $projectRoot
$cleanupTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "01:00"
$cleanupSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$cleanupPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

try {
    Unregister-ScheduledTask -TaskName "BackupCleanup_$Environment" -TaskPath "\MentorPlatform\Backups" -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName "BackupCleanup_$Environment" -Action $cleanupAction -Trigger $cleanupTrigger -Settings $cleanupSettings -Principal $cleanupPrincipal -TaskPath "\MentorPlatform\Backups" -Description "Cleanup old backups for Mentor Matching Platform ($Environment environment)"
    Write-Log "Created backup cleanup scheduled task" "Success"
    $tasksCreated++
} catch {
    Write-Log "Failed to create backup cleanup task: $($_.Exception.Message)" "Error"
}

# Create backup monitoring script
Write-Log "Creating backup monitoring script..." "Info"

$monitorScript = @'
# Backup Monitoring Script (PowerShell)
param([string]$Environment = "production")

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $projectRoot "backups"
$alertThresholdHours = 8

if (-not (Test-Path $backupDir)) {
    Write-Error "Backup directory not found"
    exit 1
}

# Find most recent backup for environment
$latestBackup = Get-ChildItem $backupDir -Directory | 
    Where-Object { $_.Name -match "_${Environment}_" } | 
    Sort-Object CreationTime -Descending | 
    Select-Object -First 1

if (-not $latestBackup) {
    Write-Error "No backups found for environment: $Environment"
    exit 1
}

# Check backup age
$backupAgeHours = ((Get-Date) - $latestBackup.CreationTime).TotalHours

if ($backupAgeHours -gt $alertThresholdHours) {
    Write-Warning "Latest backup is $([math]::Round($backupAgeHours, 2)) hours old (threshold: $alertThresholdHours hours)"
    Write-Host "Latest backup: $($latestBackup.FullName)"
    exit 1
} else {
    Write-Host "OK: Latest backup is $([math]::Round($backupAgeHours, 2)) hours old"
    Write-Host "Latest backup: $($latestBackup.FullName)"
    
    # Check backup size
    $backupSize = (Get-ChildItem $latestBackup.FullName -Recurse | Measure-Object -Property Length -Sum).Sum
    $backupSizeMB = [math]::Round($backupSize / 1MB, 2)
    Write-Host "Backup size: ${backupSizeMB} MB"
    
    # Check backup integrity
    $metadataFile = Join-Path $latestBackup.FullName "backup_metadata.json"
    if (Test-Path $metadataFile) {
        Write-Host "Backup metadata: OK"
    } else {
        Write-Warning "Backup metadata missing"
        exit 1
    }
}

exit 0
'@

$monitorScriptPath = "scripts\monitor-backups.ps1"
$monitorScript | Out-File -FilePath $monitorScriptPath -Encoding UTF8
Write-Log "Created backup monitoring script: $monitorScriptPath" "Success"

# Create backup monitoring scheduled task
$monitorAction = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -File `"$projectRoot\scripts\monitor-backups.ps1`" -Environment $Environment" -WorkingDirectory $projectRoot
$monitorTrigger = New-ScheduledTaskTrigger -Once -At "00:00" -RepetitionInterval (New-TimeSpan -Hours 2) -RepetitionDuration (New-TimeSpan -Days 365)
$monitorSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$monitorPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

try {
    Unregister-ScheduledTask -TaskName "BackupMonitor_$Environment" -TaskPath "\MentorPlatform\Backups" -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName "BackupMonitor_$Environment" -Action $monitorAction -Trigger $monitorTrigger -Settings $monitorSettings -Principal $monitorPrincipal -TaskPath "\MentorPlatform\Backups" -Description "Monitor backup status for Mentor Matching Platform ($Environment environment)"
    Write-Log "Created backup monitoring scheduled task" "Success"
    $tasksCreated++
} catch {
    Write-Log "Failed to create backup monitoring task: $($_.Exception.Message)" "Error"
}

# Create backup status script
Write-Log "Creating backup status script..." "Info"

$statusScript = @'
# Backup Status Check for Health Monitoring (PowerShell)
param([string]$Environment = $env:NODE_ENV)

if (-not $Environment) { $Environment = "production" }

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $projectRoot "backups"

function Get-BackupStatus {
    try {
        if (-not (Test-Path $backupDir)) {
            return @{
                status = "error"
                message = "Backup directory not found"
                timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
            }
        }

        # Find latest backup for environment
        $backups = Get-ChildItem $backupDir -Directory | 
            Where-Object { $_.Name -match "_${Environment}_" } | 
            Sort-Object CreationTime -Descending

        if ($backups.Count -eq 0) {
            return @{
                status = "error"
                message = "No backups found for environment: $Environment"
                timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
            }
        }

        $latestBackup = $backups[0]
        $ageHours = ((Get-Date) - $latestBackup.CreationTime).TotalHours
        $alertThreshold = if ($Environment -eq "production") { 8 } else { 24 }

        $status = @{
            status = if ($ageHours -gt $alertThreshold) { "warning" } else { "ok" }
            latestBackup = $latestBackup.Name
            ageHours = [math]::Round($ageHours, 2)
            alertThreshold = $alertThreshold
            backupCount = $backups.Count
            timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        }

        if ($ageHours -gt $alertThreshold) {
            $status.message = "Latest backup is $($status.ageHours) hours old (threshold: $alertThreshold hours)"
        } else {
            $status.message = "Latest backup is $($status.ageHours) hours old"
        }

        return $status
    } catch {
        return @{
            status = "error"
            message = $_.Exception.Message
            timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        }
    }
}

# If called directly, output JSON
if ($MyInvocation.InvocationName -eq $MyInvocation.MyCommand.Name) {
    Get-BackupStatus | ConvertTo-Json -Depth 3
}
'@

$statusScriptPath = "scripts\backup-status.ps1"
$statusScript | Out-File -FilePath $statusScriptPath -Encoding UTF8
Write-Log "Created backup status script: $statusScriptPath" "Success"

# Display created tasks
Write-Log "Displaying created scheduled tasks..." "Info"
Get-ScheduledTask -TaskPath "\MentorPlatform\Backups\*" | Format-Table TaskName, State, NextRunTime -AutoSize

Write-Log "Backup automation setup completed!" "Success"
Write-Log "Backup schedules for $Environment environment:" "Info"

switch ($Environment) {
    "production" {
        Write-Host "  - Full backup: Every 4 hours starting at 2:00 AM"
        Write-Host "  - Database backup: Every hour"
        Write-Host "  - Configuration backup: Daily at 2:30 AM"
        Write-Host "  - Backup monitoring: Every 2 hours"
    }
    "staging" {
        Write-Host "  - Full backup: Daily at 2:00 AM"
        Write-Host "  - Database backup: Every 4 hours"
        Write-Host "  - Configuration backup: Daily at 3:00 AM"
        Write-Host "  - Backup monitoring: Every 2 hours"
    }
    "development" {
        Write-Host "  - Full backup: Daily at 2:00 AM"
        Write-Host "  - Database backup: Every 12 hours starting at 2:00 AM"
        Write-Host "  - Configuration backup: Daily at 3:00 AM"
        Write-Host "  - Backup monitoring: Every 2 hours"
    }
}

Write-Host ""
Write-Log "Log files location: $projectRoot\logs\scheduled-tasks\" "Info"
Write-Log "Backup monitoring: .\scripts\monitor-backups.ps1 -Environment $Environment" "Info"
Write-Log "Backup status check: .\scripts\backup-status.ps1 -Environment $Environment" "Info"

Write-Log "Make sure to test the backup and restore procedures regularly!" "Warning"
Write-Log "To view scheduled tasks: Get-ScheduledTask -TaskPath '\MentorPlatform\Backups\*'" "Info"
Write-Log "To remove scheduled tasks: Get-ScheduledTask -TaskPath '\MentorPlatform\Backups\*' | Unregister-ScheduledTask -Confirm:`$false" "Info"