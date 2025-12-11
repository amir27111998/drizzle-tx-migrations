# Testing Guide

This guide shows how to test the migration system with local databases.

## Table of Contents

1. [Running Unit Tests](#running-unit-tests)
2. [Testing with PostgreSQL](#testing-with-postgresql)
3. [Testing with MySQL](#testing-with-mysql)
4. [Testing with SQLite](#testing-with-sqlite)
5. [CI/CD Integration](#cicd-integration)
6. [Common Testing Scenarios](#common-testing-scenarios)

## Running Unit Tests

The package includes comprehensive unit tests using Node.js's built-in test runner.

### Install Dependencies

```bash
npm install
npm run build
```

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Test Coverage

Tests cover:
- ✅ Migration file generation
- ✅ Migration validation
- ✅ Migration execution
- ✅ Rollback functionality
- ✅ Transaction handling
- ✅ Error scenarios

## Testing with PostgreSQL

### 1. Setup Local PostgreSQL

**Using Docker:**
```bash
docker run --name postgres-test \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=test_db \
  -p 5432:5432 \
  -d postgres:15
```

**Or install locally:**
```bash
# macOS
brew install postgresql
brew services start postgresql

# Create test database
createdb test_db
```

### 2. Create Test Project

```bash
mkdir test-drizzle-migrations
cd test-drizzle-migrations
npm init -y
npm install drizzle-orm pg
npm install drizzle-tx-migrations  # or use local link
```

### 3. Create Configuration

**drizzle-migrations.config.ts:**
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Migrator, MigrationGenerator } from 'drizzle-tx-migrations';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'test_db',
});

const db = drizzle(pool);

export const migrator = new Migrator({
  db,
  dialect: 'postgresql',
  config: {
    migrationsFolder: './migrations',
  },
});

export const generator = new MigrationGenerator('./migrations');
export default { migrator, generator };
```

### 4. Test Migration Workflow

```bash
# Generate migration
npx drizzle-tx-migrations generate create_users_table

# Edit migration file
# migrations/TIMESTAMP_create_users_table.ts
```

**Example migration:**
```typescript
import { type MigrationContext } from 'drizzle-tx-migrations';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS users`);
}

export default { up, down };
```

```bash
# Validate migrations
npx drizzle-tx-migrations validate

# Check status (CI/CD use)
npx drizzle-tx-migrations check

# Run migrations
npx drizzle-tx-migrations up

# Verify in database
psql -d test_db -c "SELECT * FROM users;"
psql -d test_db -c "SELECT * FROM __drizzle_migrations;"

# Check status
npx drizzle-tx-migrations status

# Revert migration
npx drizzle-tx-migrations down

# Verify rollback
psql -d test_db -c "\dt"  # users table should be gone
```

### 5. Test Transaction Rollback

**Create failing migration:**
```bash
npx drizzle-tx-migrations generate test_transaction_rollback
```

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`CREATE TABLE test1 (id SERIAL PRIMARY KEY)`);
  await db.execute(sql`CREATE TABLE test2 (id SERIAL PRIMARY KEY)`);

  // This will fail intentionally
  throw new Error('Intentional failure to test rollback');
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS test2`);
  await db.execute(sql`DROP TABLE IF EXISTS test1`);
}

export default { up, down };
```

```bash
# Try to run - it should fail and rollback
npx drizzle-tx-migrations up

# Verify tables were NOT created (transaction rolled back)
psql -d test_db -c "\dt"

# Check migration status
npx drizzle-tx-migrations status
# Should show the migration as pending (not executed)
```

## Testing with MySQL

### 1. Setup Local MySQL

**Using Docker:**
```bash
docker run --name mysql-test \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=test_db \
  -p 3306:3306 \
  -d mysql:8
```

**Or install locally:**
```bash
# macOS
brew install mysql
brew services start mysql

# Create test database
mysql -u root -p -e "CREATE DATABASE test_db;"
```

### 2. Create Configuration

**drizzle-migrations.config.ts:**
```typescript
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { Migrator, MigrationGenerator } from 'drizzle-tx-migrations';

const poolConnection = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'test_db',
});

const db = drizzle(poolConnection);

export const migrator = new Migrator({
  db,
  dialect: 'mysql',
  config: {
    migrationsFolder: './migrations',
  },
});

export const generator = new MigrationGenerator('./migrations');
export default { migrator, generator };
```

### 3. Test MySQL-Specific Features

```bash
npx drizzle-tx-migrations generate create_users_mysql
```

**MySQL migration example:**
```typescript
import { type MigrationContext } from 'drizzle-tx-migrations';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    CREATE TABLE users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS users`);
}

export default { up, down };
```

```bash
# Run and verify
npx drizzle-tx-migrations up
mysql -u root -p test_db -e "SHOW TABLES;"
mysql -u root -p test_db -e "DESCRIBE users;"
```

## Testing with SQLite

### 1. No Setup Required!

SQLite is file-based, so no server setup needed.

### 2. Create Configuration

**drizzle-migrations.config.ts:**
```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { Migrator, MigrationGenerator } from 'drizzle-tx-migrations';

const sqlite = new Database('./test.db');
const db = drizzle(sqlite);

export const migrator = new Migrator({
  db,
  dialect: 'sqlite',
  config: {
    migrationsFolder: './migrations',
  },
});

export const generator = new MigrationGenerator('./migrations');
export default { migrator, generator };
```

### 3. Test Workflow

```bash
# Generate migration
npx drizzle-tx-migrations generate create_users_sqlite

# Run migration
npx drizzle-tx-migrations up

# Verify using sqlite3 CLI
sqlite3 test.db "SELECT * FROM __drizzle_migrations;"
sqlite3 test.db ".schema users"

# Check status
npx drizzle-tx-migrations status

# Revert
npx drizzle-tx-migrations down
```

## CI/CD Integration

### GitHub Actions Example

**.github/workflows/migrations.yml:**
```yaml
name: Migration Check

on:
  pull_request:
    branches: [main]

jobs:
  check-migrations:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build package
        run: npm run build

      - name: Check migrations
        run: npx drizzle-tx-migrations check
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_USER: postgres
          DB_PASSWORD: postgres
          DB_NAME: test_db

      - name: Run migrations (for testing)
        run: npx drizzle-tx-migrations up

      - name: Verify no pending migrations
        run: npx drizzle-tx-migrations check
```

### What the Check Command Does

```bash
# Exit code 0 (success) when:
- All migration files are valid
- No pending migrations (database is up to date)

# Exit code 1 (failure) when:
- Migration files have errors
- There are pending migrations
- Database is unreachable

# Use in CI/CD:
npx drizzle-tx-migrations check  # Fails if migrations needed
```

### Use `--no-fail-pending` for Different Scenarios

```bash
# Only validate files, don't fail on pending migrations
npx drizzle-tx-migrations check --no-fail-pending

# Or use validate command (no database connection needed)
npx drizzle-tx-migrations validate
```

## Common Testing Scenarios

### Scenario 1: Test New Migration

```bash
# 1. Generate migration
npx drizzle-tx-migrations generate add_posts_table

# 2. Validate syntax
npx drizzle-tx-migrations validate

# 3. Check current status
npx drizzle-tx-migrations status

# 4. Run in test environment
npx drizzle-tx-migrations up

# 5. Verify in database
psql -d test_db -c "\dt"

# 6. Test rollback
npx drizzle-tx-migrations down

# 7. Verify rollback
psql -d test_db -c "\dt"

# 8. Re-run
npx drizzle-tx-migrations up
```

### Scenario 2: Test Multiple Migrations

```bash
# Generate multiple migrations
npx drizzle-tx-migrations generate create_users
npx drizzle-tx-migrations generate create_posts
npx drizzle-tx-migrations generate create_comments

# Validate all
npx drizzle-tx-migrations validate

# Run all
npx drizzle-tx-migrations up

# Check status
npx drizzle-tx-migrations status

# Revert last 2
npx drizzle-tx-migrations down --count=2

# Check what's left
npx drizzle-tx-migrations status
```

### Scenario 3: Test Transaction Rollback

**Create migration that will fail:**
```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // This succeeds
  await db.execute(sql`CREATE TABLE test1 (id SERIAL PRIMARY KEY)`);

  // This succeeds
  await db.execute(sql`CREATE TABLE test2 (id SERIAL PRIMARY KEY)`);

  // This fails - will rollback everything
  await db.execute(sql`INVALID SQL HERE`);
}
```

```bash
# Run migration - it will fail
npx drizzle-tx-migrations up
# Output: ✗ Migration failed. Transaction rolled back.

# Verify NEITHER table was created (transaction rolled back)
psql -d test_db -c "\dt"

# Migration should still be pending
npx drizzle-tx-migrations status
```

### Scenario 4: Test with Seed Data

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    CREATE TABLE roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL
    )
  `);

  // Insert seed data
  await db.execute(sql`
    INSERT INTO roles (name) VALUES
    ('admin'),
    ('user'),
    ('guest')
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS roles`);
}
```

```bash
npx drizzle-tx-migrations up
psql -d test_db -c "SELECT * FROM roles;"
```

### Scenario 5: Test Revert to Specific Migration

```bash
# Run several migrations
npx drizzle-tx-migrations up

# Check which migrations are executed
npx drizzle-tx-migrations status

# Revert to a specific migration
npx drizzle-tx-migrations down --to=1234567890_create_users_table

# This will revert ALL migrations after the specified one
```

## Automated Testing Script

**test-migrations.sh:**
```bash
#!/bin/bash
set -e

echo "🧪 Testing Migration System"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "1️⃣  Validating migration files..."
if npx drizzle-tx-migrations validate; then
  echo -e "${GREEN}✓ Validation passed${NC}"
else
  echo -e "${RED}✗ Validation failed${NC}"
  exit 1
fi

echo ""
echo "2️⃣  Checking migration status..."
npx drizzle-tx-migrations status

echo ""
echo "3️⃣  Running migrations..."
if npx drizzle-tx-migrations up; then
  echo -e "${GREEN}✓ Migrations executed${NC}"
else
  echo -e "${RED}✗ Migration failed${NC}"
  exit 1
fi

echo ""
echo "4️⃣  Verifying database is up to date..."
if npx drizzle-tx-migrations check; then
  echo -e "${GREEN}✓ Database is up to date${NC}"
else
  echo -e "${RED}✗ Database has issues${NC}"
  exit 1
fi

echo ""
echo "5️⃣  Testing rollback..."
if npx drizzle-tx-migrations down --count=1; then
  echo -e "${GREEN}✓ Rollback successful${NC}"
else
  echo -e "${RED}✗ Rollback failed${NC}"
  exit 1
fi

echo ""
echo "6️⃣  Re-running migrations..."
if npx drizzle-tx-migrations up; then
  echo -e "${GREEN}✓ Re-run successful${NC}"
else
  echo -e "${RED}✗ Re-run failed${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ All tests passed!${NC}"
```

Make it executable and run:
```bash
chmod +x test-migrations.sh
./test-migrations.sh
```

## Testing Best Practices

1. **Always test in a separate database**
   - Use `test_db` or similar
   - Never test on production data

2. **Test both directions**
   - Run migrations up
   - Test rollback down
   - Re-run up to ensure repeatability

3. **Test transaction rollback**
   - Create intentionally failing migrations
   - Verify rollback works correctly

4. **Test in CI/CD**
   - Use `check` command to catch missing migrations
   - Run migrations in test environment
   - Verify no pending migrations remain

5. **Validate before running**
   ```bash
   npx drizzle-tx-migrations validate && \
   npx drizzle-tx-migrations up
   ```

6. **Use Docker for consistency**
   - Same database version across environments
   - Easy cleanup and reset

7. **Test migration conflicts**
   - Create out-of-order migrations
   - Verify validator catches them

## Troubleshooting Tests

### Issue: "Cannot connect to database"

```bash
# Check if database is running
docker ps  # for Docker
pg_isready  # for PostgreSQL

# Check connection details
psql -h localhost -U postgres -d test_db

# Update configuration with correct credentials
```

### Issue: "Migration table already exists"

```bash
# Drop and recreate database
dropdb test_db && createdb test_db

# Or manually drop table
psql -d test_db -c "DROP TABLE __drizzle_migrations;"
```

### Issue: "Tests fail with import errors"

```bash
# Rebuild the package
npm run build

# Check imports in migration files
# Make sure they use correct paths
```

### Issue: "Transaction not rolling back"

Some databases have limitations:
- MySQL: Some DDL statements auto-commit
- SQLite: Check if running in WAL mode

## Next Steps

1. Run the unit tests: `npm test`
2. Set up a local database (PostgreSQL/MySQL/SQLite)
3. Test the complete workflow
4. Integrate into your CI/CD pipeline
5. Test with your actual application

For more examples, see the `/examples` directory.
