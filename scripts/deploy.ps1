# Mentor Matching Platform - PowerShell Deployment Script
# This script automates the deployment process for different environments

param(
    [Parameter(Position=0)]
    [ValidateSet("development", "staging", "production")]
    [string]$Environment = "development",
    
    [Parameter(Position=1)]
    [string]$Version = "latest",
    
    [switch]$Help
)

# Show help if requested
if ($Help) {
    Write-Host @"
Mentor Matching Platform Deployment Script

Usage: .\deploy.ps1 [ENVIRONMENT] [VERSION]

ENVIRONMENT:
    development  - Deploy to development environment (default)
    staging      - Deploy to staging environment
    production   - Deploy to production environment

VERSION:
    latest       - Deploy latest version (default)
    <tag>        - Deploy specific version tag

Examples:
    .\deploy.ps1                          # Deploy latest to development
    .\deploy.ps1 staging                  # Deploy latest to staging
    .\deploy.ps1 production v1.2.3        # Deploy v1.2.3 to production

Options:
    -Help                                 # Show this help message
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

Write-Info "Deploying to $Environment environment"

# Pre-deployment checks
Write-Info "Running pre-deployment checks..."

# Check if Docker is running
try {
    docker info | Out-Null
    Write-Success "Docker is running"
} catch {
    Write-Error "Docker is not running. Please start Docker and try again."
    exit 1
}

# Check if required files exist
$RequiredFiles = @(
    "docker-compose.yml",
    "docker-compose.prod.yml",
    ".env.example"
)

foreach ($file in $RequiredFiles) {
    $filePath = Join-Path $ProjectRoot $file
    if (-not (Test-Path $filePath)) {
        Write-Error "Required file not found: $file"
        exit 1
    }
}

Write-Success "Pre-deployment checks passed"

# Environment-specific configuration
switch ($Environment) {
    "development" {
        $ComposeFile = "docker-compose.yml"
        $EnvFile = ".env"
    }
    "staging" {
        $ComposeFile = "docker-compose.prod.yml"
        $EnvFile = ".env.staging"
    }
    "production" {
        $ComposeFile = "docker-compose.prod.yml"
        $EnvFile = ".env.production"
    }
}

# Check if environment file exists
$EnvFilePath = Join-Path $ProjectRoot $EnvFile
if (-not (Test-Path $EnvFilePath)) {
    Write-Warning "Environment file not found: $EnvFile"
    $ExampleEnvPath = Join-Path $ProjectRoot ".env.example"
    if (Test-Path $ExampleEnvPath) {
        Write-Info "Copying .env.example to $EnvFile"
        Copy-Item $ExampleEnvPath $EnvFilePath
        Write-Warning "Please update $EnvFile with appropriate values before deployment"
    } else {
        Write-Error "No environment file found and no .env.example to copy from"
        exit 1
    }
}

# Change to project root
Set-Location $ProjectRoot

# Set environment variables
$env:COMPOSE_FILE = $ComposeFile
$env:VERSION = $Version

# Build images
Write-Info "Building Docker images..."
try {
    docker-compose -f $ComposeFile build
    Write-Success "Docker images built successfully"
} catch {
    Write-Error "Failed to build Docker images"
    exit 1
}

# Database migration
Write-Info "Running database migrations..."
$MigrateScript = Join-Path $ScriptDir "migrate.ps1"
if (Test-Path $MigrateScript) {
    & $MigrateScript $Environment
} else {
    Write-Warning "No migration script found, skipping database migrations"
}

# Deploy services
Write-Info "Deploying services..."
try {
    docker-compose -f $ComposeFile --env-file $EnvFile up -d
    Write-Success "Services deployed successfully"
} catch {
    Write-Error "Failed to deploy services"
    exit 1
}

# Wait for services to be ready
Write-Info "Waiting for services to be ready..."
Start-Sleep -Seconds 30

# Health checks
Write-Info "Running health checks..."
$HealthCheckScript = Join-Path $ScriptDir "health-check.js"
if (Test-Path $HealthCheckScript) {
    try {
        node $HealthCheckScript
        Write-Success "Health checks passed"
    } catch {
        Write-Error "Health checks failed"
        exit 1
    }
} else {
    Write-Warning "No health check script found, skipping health checks"
}

# Post-deployment tasks
Write-Info "Running post-deployment tasks..."

# Seed data for development
if ($Environment -eq "development") {
    Write-Info "Seeding development data..."
    try {
        docker-compose -f $ComposeFile exec -T postgres psql -U postgres -d mentor_platform -f /docker-entrypoint-initdb.d/02-seed-data.sql
    } catch {
        Write-Warning "Failed to seed data"
    }
}

# Clean up old images
Write-Info "Cleaning up old Docker images..."
docker image prune -f

Write-Success "Deployment completed successfully!"

# Display service URLs
Write-Info "Service URLs:"
switch ($Environment) {
    "development" {
        Write-Host "  Frontend: http://localhost:3001"
        Write-Host "  API Gateway: http://localhost:3000"
        Write-Host "  API Documentation: http://localhost:3000/api-docs"
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

Write-Info "Deployment logs can be viewed with: docker-compose -f $ComposeFile logs -f"