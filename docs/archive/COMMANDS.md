# Command Reference

Complete reference for all migration commands.

## Commands Overview

| Command | Description | DB Required | Exit 1 on Error |
|---------|-------------|-------------|-----------------|
| `generate` | Create new migration file | ❌ | ✅ |
| `up`, `run` | Run pending migrations | ✅ | ✅ |
| `down`, `revert` | Revert migrations | ✅ | ✅ |
| `status` | Show migration status | ✅ | ❌ |
| `check` | Validate + check pending | ✅ | ✅ |
| `validate` | Validate files only | ❌ | ✅ |
| `list` | List migration files | ❌ | ❌ |

## Comparison with TypeORM

### TypeORM Command
```bash
typeorm-ts-node-commonjs -d config.ts migration:generate Check --dryrun --pretty --check
```

**What it does:**
- `--dryrun` - Don't create files, just check
- `--pretty` - Pretty print SQL
- `--check` - Exit 1 if schema changes detected

### Equivalent in drizzle-tx-migrations

```bash
# Similar to TypeORM's check
drizzle-tx-migrations check
```

**What it does:**
- ✅ Validates all migration files
- ✅ Checks for pending migrations
- ✅ Exits with code 1 if issues found
- ✅ Perfect for CI/CD pipelines

## Detailed Command Reference

### `generate <name>`

Generate a new migration file.

```bash
drizzle-tx-migrations generate create_users_table
drizzle-tx-migrations generate --name=add_email_column
```

**Options:**
- `<name>` - Migration name (required)
- `--name=<name>` - Alternative syntax

**Output:**
- Creates `TIMESTAMP_name.ts` in migrations folder
- File contains `up()` and `down()` template

**Exit codes:**
- `0` - Success
- `1` - Error (e.g., invalid name)

**Example:**
```bash
$ drizzle-tx-migrations generate create_users_table
✓ Migration created: migrations/1702468800000_create_users_table.ts
```

---

### `up`, `run`

Run all pending migrations.

```bash
drizzle-tx-migrations up
drizzle-tx-migrations run
```

**Features:**
- ✅ Runs in transaction (auto-rollback on failure)
- ✅ Tracks executed migrations
- ✅ Skips already-executed migrations
- ✅ Stops on first failure

**Exit codes:**
- `0` - All migrations succeeded
- `1` - Migration failed (rolled back)

**Example:**
```bash
$ drizzle-tx-migrations up
Running migrations...

✓ Migration "1702468800000_create_users_table" executed successfully.
✓ Migration "1702468900000_add_posts_table" executed successfully.

✓ All migrations executed successfully.
```

---

### `down`, `revert`

Revert migrations.

```bash
# Revert last migration
drizzle-tx-migrations down

# Revert last 3 migrations
drizzle-tx-migrations down --count=3

# Revert to specific migration
drizzle-tx-migrations down --to=1702468800000_create_users_table
```

**Options:**
- `--count=<n>` - Number of migrations to revert (default: 1)
- `--to=<name>` - Revert to (and keep) this migration

**Features:**
- ✅ Runs in transaction
- ✅ Removes from tracking table
- ✅ Executes `down()` function

**Exit codes:**
- `0` - Revert succeeded
- `1` - Revert failed (rolled back)

**Example:**
```bash
$ drizzle-tx-migrations down --count=2
Reverting 2 migration(s).

✓ Migration "1702468900000_add_posts_table" reverted successfully.
✓ Migration "1702468800000_create_users_table" reverted successfully.

✓ All migrations reverted successfully.
```

---

### `status`

Show current migration status.

```bash
drizzle-tx-migrations status
```

**Output:**
- Lists executed migrations with timestamps
- Lists pending migrations
- Shows if database is up to date

**Exit codes:**
- Always `0` (informational only)

**Example:**
```bash
$ drizzle-tx-migrations status
Migration Status:

✓ Executed migrations:
  - 1702468800000_create_users_table (12/11/2024, 10:30:00 AM)
  - 1702468900000_add_posts_table (12/11/2024, 10:31:00 AM)

⏳ Pending migrations:
  - 1702469000000_add_comments_table

Database is behind.
```

---

### `check`

**⭐ Most important for CI/CD**

Validate migrations and check database status.

```bash
# Fail if pending migrations exist
drizzle-tx-migrations check

# Only validate, don't fail on pending
drizzle-tx-migrations check --no-fail-pending
```

**Features:**
- ✅ Validates all migration files
- ✅ Checks for duplicate timestamps
- ✅ Checks for missing up/down functions
- ✅ Checks database connection
- ✅ Checks for pending migrations
- ✅ Detects out-of-order migrations

**Exit codes:**
- `0` - All checks passed, database up to date
- `1` - Validation errors OR pending migrations

**Use cases:**
- ✅ CI/CD pipelines (fail if migrations not run)
- ✅ Pre-deployment checks
- ✅ Ensure team hasn't forgotten migrations

**Example (Success):**
```bash
$ drizzle-tx-migrations check
🔍 Checking migrations...

✓ Executed migrations: 5
⏳ Pending migrations: 0

✅ All checks passed! Database is up to date.

$ echo $?
0
```

**Example (Failure - Pending):**
```bash
$ drizzle-tx-migrations check
🔍 Checking migrations...

✓ Executed migrations: 5
⏳ Pending migrations: 2

❌ Check failed: Database has pending migrations that need to be run.
   Run: drizzle-tx-migrations up

$ echo $?
1
```

**Example (Failure - Validation):**
```bash
$ drizzle-tx-migrations check
🔍 Checking migrations...

✓ Executed migrations: 5
⏳ Pending migrations: 1

✗ Errors:
  - 1702469000000_invalid.ts: Missing up() function
  - Duplicate timestamp 1702468800000 found in files: ...

❌ Check failed: Migration validation errors found.

$ echo $?
1
```

---

### `validate`

Validate migration files without database connection.

```bash
drizzle-tx-migrations validate
```

**Features:**
- ✅ Validates file structure
- ✅ Checks for up/down functions
- ✅ Checks for duplicate timestamps
- ✅ Checks naming conventions
- ❌ Does NOT check database

**Exit codes:**
- `0` - All files valid
- `1` - Validation errors

**Use cases:**
- Pre-commit hooks
- Linting in CI
- Local development check

**Example:**
```bash
$ drizzle-tx-migrations validate
Validating migration files...

⚠️  Warnings:
  - 1702469000000_test.ts: up() function may not be using MigrationContext parameters

✓ Validation passed with warnings.
```

---

### `list`

List all migration files.

```bash
drizzle-tx-migrations list
```

**Output:**
- Lists all migration files in order

**Exit codes:**
- Always `0`

**Example:**
```bash
$ drizzle-tx-migrations list
Available migrations:
  - 1702468800000_create_users_table.ts
  - 1702468900000_add_posts_table.ts
  - 1702469000000_add_comments_table.ts
```

---

## CI/CD Usage Patterns

### Pattern 1: Fail if migrations not run

```bash
# Exactly like TypeORM's --check flag
drizzle-tx-migrations check
```

**Use in:**
- Pull request checks
- Pre-deployment validation
- Production safety checks

### Pattern 2: Validate only (no DB)

```bash
drizzle-tx-migrations validate
```

**Use in:**
- Pre-commit hooks
- Code linting
- Fast checks without DB

### Pattern 3: Full migration test

```bash
# Validate → Run → Verify
drizzle-tx-migrations validate && \
drizzle-tx-migrations up && \
drizzle-tx-migrations check
```

**Use in:**
- Integration tests
- Staging deployments
- Full CI pipeline

### Pattern 4: Check but allow pending

```bash
drizzle-tx-migrations check --no-fail-pending
```

**Use in:**
- Development environments
- When pending migrations are expected

---

## Exit Code Summary

Quick reference for scripting:

```bash
# Exit 0 (success)
✅ drizzle-tx-migrations status        # Always
✅ drizzle-tx-migrations list          # Always
✅ drizzle-tx-migrations check         # If DB up to date
✅ drizzle-tx-migrations validate      # If files valid
✅ drizzle-tx-migrations up            # If migrations succeed
✅ drizzle-tx-migrations down          # If revert succeeds

# Exit 1 (failure)
❌ drizzle-tx-migrations check         # If pending or errors
❌ drizzle-tx-migrations validate      # If validation fails
❌ drizzle-tx-migrations up            # If migration fails
❌ drizzle-tx-migrations down          # If revert fails
```

---

## Scripting Examples

### Check before deploy

```bash
#!/bin/bash
if drizzle-tx-migrations check; then
  echo "✅ Ready to deploy"
else
  echo "❌ Run migrations first!"
  exit 1
fi
```

### Auto-run in dev

```bash
#!/bin/bash
if ! drizzle-tx-migrations check --no-fail-pending; then
  echo "Validation failed!"
  exit 1
fi

if ! drizzle-tx-migrations up; then
  echo "Migration failed!"
  exit 1
fi

echo "✅ Database ready"
npm run dev
```

### Test migration roundtrip

```bash
#!/bin/bash
set -e

echo "Testing migrations..."

# Run up
drizzle-tx-migrations up
echo "✓ Up succeeded"

# Verify
drizzle-tx-migrations check
echo "✓ Check passed"

# Revert
drizzle-tx-migrations down --count=1
echo "✓ Down succeeded"

# Re-run
drizzle-tx-migrations up
echo "✓ Re-run succeeded"

echo "✅ Migrations are reversible"
```

---

## Environment Variables

Most database configurations use environment variables:

```bash
# PostgreSQL
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD=postgres
export DB_NAME=mydb

# Then run commands
drizzle-tx-migrations check
```

**Configuration file reads from `process.env`:**

```typescript
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'mydb',
});
```

---

## Summary: TypeORM vs drizzle-tx-migrations

| TypeORM | drizzle-tx-migrations | Purpose |
|---------|----------------------|---------|
| `migration:generate --check` | `check` | Fail if migrations needed |
| `migration:run` | `up`, `run` | Run migrations |
| `migration:revert` | `down`, `revert` | Revert migrations |
| `migration:show` | `status` | Show migration status |
| N/A | `validate` | Validate without DB |
| N/A | `check --no-fail-pending` | Validate, allow pending |

**Key advantage:** Same familiar workflow, better transaction handling!
