# Shared Library (`@mentor-platform/shared`)

## 1. Purpose & Responsibility

**What this module does**:
Provides a centralized repository for common code used across all microservices. This includes TypeScript Interfaces (DTOs), Utility Functions (Encryption, Auth), Database Managers, and Express Middleware.

**Why it exists**:
To prevent code duplication (DRY Code) and ensure consistency in Types, Error Handling, and Security practices across the Monorepo.

## 2. Core Components & Structure

- **`types/`**: Global interfaces (e.g., `User`, `Session`, `AuthRequest`).
- **`utils/`**:
  - `auth.ts`: JWT signing/verifying helpers.
  - `database.ts`: `DatabaseManager` wrapper for `pg`.
  - `encryption.ts`: Helpers for hashing/crypto.
  - `logger.ts`: Standardized logging format.
  - `validation.ts`: Zod/Joi schemas for input validation.
- **`middleware/`**:
  - `security.ts`: Helmet, RateLimit, and standard security headers.

## 3. Implementation Details

- **Singleton Patterns**: standardizes DB connection pooling via `DatabaseManager`.
- **Type Safety**: Serves as the single source of truth for API Contracts and Database Entities.

## 4. Inter-Module Communication

- **Inputs**: None (Library).
- **Outputs**: Exports modules imported by `auth-service`, `api-gateway`, etc.
- **Dependencies**:
  - `pg`: Postgres Client.
  - `ioredis`: Redis Client.
  - `jsonwebtoken`: JWT Logic.

## 5. Usage Example

**Importing in another service**:

```typescript
import { DatabaseManager, AuthUtils } from '@mentor-platform/shared';

// Initialize DB
const db = new DatabaseManager(config);

// Verify Token
const decoded = AuthUtils.verifyToken(token);
```
