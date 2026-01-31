# DevOps Scripts

## 1. Purpose & Responsibility

**What this module does**:
Automates the operational lifecycle of the application. It contains utilities for Deployment, Database Migrations, Backups, Restoration, and Health Checking.

**Why it exists**:
To reduce human error during critical operations and provide a standardized way to manage the environment.

## 2. Core Components & Structure

- **Deployment**:
  - `deploy.sh` / `deploy.ps1`: Builds images and starts containers.
  - `rollback.sh`: Reverts to a previous docker tag.
- **Database**:
  - `migrate.sh`: Applies SQL changes.
  - `backup.sh`: Dumps Postgres/Redis data to archives.
  - `restore.sh`: Rehydrates DB from a backup file.
- **Validation**:
  - `health-check.js`: Verifies all services are responding.

## 3. Implementation Details

- **Polyglot**: Scripts are provided in both `Bash` (Linux/Mac) and `PowerShell` (Windows) for cross-platform compatibility.
- **Environment Aware**: Most scripts accept an argument (`development`, `staging`, `production`) to load the correct `.env` file.

## 4. Inter-Module Communication

- **Inputs**: CLI Arguments, Environment Variables.
- **Outputs**: Docker interactions, File generation (Backups).
- **Dependencies**:
  - `Docker CLI`: Must be installed.
  - `Node.js`: Required for some validation scripts.

## 5. Usage Example

**Deploying to Staging**:

```bash
./scripts/deploy.sh staging
```

**Creating a Manual Backup**:

```bash
./scripts/backup.sh
# Creates ./backups/mentor_platform_YYYY-MM-DD.tar.gz
```
