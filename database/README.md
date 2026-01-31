# Database Infrastructure

## 1. Purpose & Responsibility

**What this module does**:
Contains the source of truth for the PostgreSQL database schema. This includes the initial Schema definition (`init`), incremental Migrations, and Seed Logic for development data.

**Why it exists**:
To provide reliable, version-controlled database state management, ensuring all environments (Dev/Staging/Prod) operate on the same schema structure.

## 2. Core Components & Structure

- **`init/`**:
  - `01-create-tables.sql`: The baseline schema creation script. Defines core Tables, Enums, and Indexes.
  - `02-seed-data.sql`: Dev data for testing.
- **`migrations/`**:
  - Incremental SQL files (e.g., `008-matching-service-tables.sql`) applied after initialization to evolve the schema.

## 3. Implementation Details

- **PostgreSQL**: Uses advanced features like `UUIDs` (`uuid-ossp` extension), `JSONB` columns, and `Triggers` for `updated_at` timestamps.
- **Execution Order**:
  1. `init` scripts run automatically by the Postgres Docker container on first launch.
  2. `migrations` are applied via the `npm run migrate` script.

## 4. Inter-Module Communication

- **Inputs**: SQL commands.
- **Outputs**: A structured Relational Database accessible on Port `5432`.
- **Dependencies**: None (Standalone Infrastructure).

## 5. Usage Example

**Running Migrations**:

```bash
# From project root
npm run migrate
```

**Modifying Schema**:

1. Create a new file in `database/migrations/` (e.g., `010-add-new-feature.sql`).
2. defined your `CREATE TABLE` or `ALTER TABLE` statements.
3. Run `npm run migrate`.
