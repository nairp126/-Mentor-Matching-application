# Database Migration Script (PowerShell)
# This script handles database migrations for different environments

param(
    [Parameter(Position=0)]
    [ValidateSet("development", "staging", "production")]
    [string]$Environment = "development",
    
    [switch]$Help
)

# Show help if requested
if ($Help) {
    Write-Host @"
Database Migration Script

Usage: .\migrate.ps1 [ENVIRONMENT]

ENVIRONMENT:
    development  - Run migrations on development database (default)
    staging      - Run migrations on staging database
    production   - Run migrations on production database

Examples:
    .\migrate.ps1                    # Migrate development database
    .\migrate.ps1 staging            # Migrate staging database
    .\migrate.ps1 production         # Migrate production database

Options:
    -Help                           # Show this help message
"@
    exit 0
}

# Color functions
function Write-Info($message) {
    Write-Host "[INFO] $message" -ForegroundColor Blue
}

function Write-Success($message) {
    Write-Host "[SUCCESS] $message" -ForegroundColor Green
}

function Write-Warning($message) {
    Write-Host "[WARNING] $message" -ForegroundColor Yellow
}

function Write-Error($message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
}

# Get script directory and project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Info "Running migrations for $Environment environment"

# Load environment variables
Set-Location $ProjectRoot

$EnvFile = switch ($Environment) {
    "development" { ".env" }
    "staging" { ".env.staging" }
    "production" { ".env.production" }
}

if (-not (Test-Path $EnvFile)) {
    Write-Error "Environment file not found: $EnvFile"
    exit 1
}

Write-Info "Loading environment from $EnvFile"

# Load environment variables from file
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^([^#][^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
}

# Database connection parameters
$DbHost = $env:DB_HOST ?? "localhost"
$DbPort = $env:DB_PORT ?? "5432"
$DbName = $env:DB_NAME ?? "mentor_platform"
$DbUser = $env:DB_USER ?? "mentor_user"
$DbPassword = $env:DB_PASSWORD

if (-not $DbPassword) {
    Write-Error "DB_PASSWORD not set in environment"
    exit 1
}

# Set PGPASSWORD for psql commands
$env:PGPASSWORD = $DbPassword

# Check if psql is available
try {
    psql --version | Out-Null
} catch {
    Write-Error "psql command not found. Please install PostgreSQL client tools."
    exit 1
}

# Check database connectivity
Write-Info "Checking database connectivity..."
try {
    $result = psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -c "SELECT 1;" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Connection failed"
    }
    Write-Success "Database connection established"
} catch {
    Write-Error "Cannot connect to database at ${DbHost}:${DbPort}"
    Write-Error "Please ensure the database is running and accessible"
    exit 1
}

# Create migrations table if it doesn't exist
Write-Info "Creating migrations tracking table..."
$createTableSql = @"
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"@

psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -c $createTableSql | Out-Null

# Get list of applied migrations
$appliedMigrations = psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -t -c "SELECT version FROM schema_migrations ORDER BY version;" | ForEach-Object { $_.Trim() }

# Find migration files
$MigrationDir = Join-Path $ProjectRoot "database\migrations"
if (-not (Test-Path $MigrationDir)) {
    Write-Error "Migration directory not found: $MigrationDir"
    exit 1
}

$MigrationFiles = Get-ChildItem -Path $MigrationDir -Filter "*.sql" | Sort-Object Name

if ($MigrationFiles.Count -eq 0) {
    Write-Warning "No migration files found in $MigrationDir"
    exit 0
}

Write-Info "Found $($MigrationFiles.Count) migration files"

# Apply migrations
$AppliedCount = 0
$SkippedCount = 0

foreach ($migrationFile in $MigrationFiles) {
    # Extract version from filename (e.g., 001-create-tables.sql -> 001)
    $version = ($migrationFile.Name -split '-')[0]
    
    # Check if migration is already applied
    if ($appliedMigrations -contains $version) {
        Write-Info "Skipping migration $version (already applied): $($migrationFile.Name)"
        $SkippedCount++
        continue
    }
    
    Write-Info "Applying migration $version`: $($migrationFile.Name)"
    
    # Apply migration in a transaction
    $migrationSql = @"
BEGIN;
\i $($migrationFile.FullName)
INSERT INTO schema_migrations (version) VALUES ('$version');
COMMIT;
"@
    
    try {
        $result = $migrationSql | psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Migration $version applied successfully"
            $AppliedCount++
        } else {
            throw "Migration failed"
        }
    } catch {
        Write-Error "Failed to apply migration $version"
        Write-Error "Migration stopped at: $($migrationFile.Name)"
        exit 1
    }
}

# Summary
Write-Info "Migration summary:"
Write-Info "  Applied: $AppliedCount"
Write-Info "  Skipped: $SkippedCount"
Write-Info "  Total: $($MigrationFiles.Count)"

if ($AppliedCount -gt 0) {
    Write-Success "Database migrations completed successfully!"
} else {
    Write-Info "No new migrations to apply"
}

# Verify database schema
Write-Info "Verifying database schema..."
$tableCount = psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | ForEach-Object { $_.Trim() }
Write-Info "Database contains $tableCount tables"

Write-Success "Migration process completed"