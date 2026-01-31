# Admin Service

## 1. Purpose & Responsibility

**What this module does**:
Provides restricted back-office functionality for System Administrators. It allows for User Management (Ban/Promote), System Health Monitoring, and Audit Log inspection.

**Why it exists**:
To separate "God Mode" capabilities from the public-facing application, ensuring tight access control and security.

## 2. Core Components & Structure

- **`index.ts`**: Entry point.
- **`routes/`**:
  - `userManagement.ts`: Endpoints to Ban users or change Roles.
  - `systemMetrics.ts`: Exposes technical stats (CPU, Memory, DB Load).
  - `audit.ts`: Read-only access to the `audit_logs` table.

## 3. Implementation Details

- **Strict Authorization**: All routes here are guarded by `adminMiddleware` (Role = ADMIN).
- **Observability**: Aggregates data from other services (via DB or direct internal calls) to provide a system-wide Status Dashboard.

## 4. Inter-Module Communication

- **Inputs**: Admin Actions.
- **Outputs**: Administrative Changes (Role updates, Bans).
- **Dependencies**:
  - Access to *all* shared tables (Users, Logs) for oversight.

## 5. Usage Example

**Banning a User**:

```http
PUT /api/admin/users/:userId/status
{ "status": "BANNED", "reason": "Violation of ToS" }
```
