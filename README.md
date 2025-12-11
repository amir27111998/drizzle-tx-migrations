# Drizzle TX Migrations

> **⚠️ DISCLAIMER**: This package was created with the assistance of Claude AI (Anthropic). While thoroughly tested, some edge cases or issues may exist. Please test thoroughly in your development environment before using in production. Contributions and bug reports are welcome!

TypeORM-like migrations for Drizzle ORM with full transaction support. This package provides a robust migration system with up/down migrations, individual rollback control, and multi-file schema support.

[![Tests](https://img.shields.io/badge/tests-17%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)]()

## Features

- ✅ **Transaction Support**: All migrations run in transactions with automatic rollback on failure
- ✅ **TypeORM-like Interface**: Familiar `up()` and `down()` methods for migrations
- ✅ **Individual Rollback**: Revert specific migrations, not just batches
- ✅ **CI/CD Ready**: `check` command exits with code 1 if migrations needed
- ✅ **Multi-Database Support**: PostgreSQL, MySQL, and SQLite
- ✅ **Multi-File Schemas**: Import schemas from multiple files
- ✅ **Type-Safe**: Full TypeScript support with type inference
- ✅ **CLI & Programmatic**: Use via CLI or directly in your code
- ✅ **Comprehensive Tests**: 17 tests covering all core functionality

## Table of Contents

- [Why This Package?](#why-this-package)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Migration File Structure](#migration-file-structure)
- [TypeORM Comparison](#typeorm-comparison)
- [Testing](#testing)
- [CI/CD Integration](#cicd-integration)
- [Migration Patterns](#migration-patterns)
- [Programmatic Usage](#programmatic-usage)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Why This Package?

This package addresses several issues found in other Drizzle migration tools:

| Feature | @drepkovsky/drizzle-migrations | drizzle-tx-migrations |
|---------|-------------------------------|----------------------|
| MySQL support | ❌ Broken (issue #9) | ✅ Works |
| Individual rollback | ❌ Batch only (issue #7) | ✅ Per migration |
| Multi-file schemas | ❌ Limited (issue #6) | ✅ Full support |
| Transaction support | ⚠️ Partial | ✅ Complete |
| Check command (CI/CD) | ❌ No | ✅ Yes |
| Validation | ❌ No | ✅ Yes |
| Tests | ❌ No | ✅ 17 tests |
| Rollback to specific | ❌ No | ✅ `--to=name` |

## Installation

```bash
npm install drizzle-tx-migrations drizzle-orm
```

Also install your database driver:

```bash
# PostgreSQL
npm install pg

# MySQL
npm install mysql2

# SQLite
npm install better-sqlite3
```

## Quick Start

### 1. Create Configuration File

Create `drizzle-migrations.config.ts` in your project root:

**PostgreSQL:**
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Migrator, MigrationGenerator } from 'drizzle-tx-migrations';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'mydb',
});

const db = drizzle(pool);

export const migrator = new Migrator({
  db,
  dialect: 'postgresql',
  config: {
    migrationsFolder: './migrations',
    migrationsTable: '__drizzle_migrations',
  },
});

export const generator = new MigrationGenerator('./migrations');
export default { migrator, generator };
```

**MySQL:**
```typescript
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { Migrator, MigrationGenerator } from 'drizzle-tx-migrations';

const poolConnection = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'mydb',
});

const db = drizzle(poolConnection);

export const migrator = new Migrator({
  db,
  dialect: 'mysql',
  config: { migrationsFolder: './migrations' },
});

export const generator = new MigrationGenerator('./migrations');
export default { migrator, generator };
```

**SQLite:**
```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { Migrator, MigrationGenerator } from 'drizzle-tx-migrations';

const sqlite = new Database('./db.sqlite');
const db = drizzle(sqlite);

export const migrator = new Migrator({
  db,
  dialect: 'sqlite',
  config: { migrationsFolder: './migrations' },
});

export const generator = new MigrationGenerator('./migrations');
export default { migrator, generator };
```

### 2. Add Scripts to package.json

```json
{
  "scripts": {
    "migration:generate": "drizzle-tx-migrations generate",
    "migration:run": "drizzle-tx-migrations up",
    "migration:revert": "drizzle-tx-migrations down",
    "migration:status": "drizzle-tx-migrations status",
    "migration:check": "drizzle-tx-migrations check"
  }
}
```

### 3. Use It!

```bash
# Generate a new migration
npm run migration:generate create_users_table

# Edit the migration file in ./migrations/

# Validate migrations
npm run migration:validate

# Check status (CI/CD - fails if pending migrations)
npm run migration:check

# Run migrations
npm run migration:run

# Check status
npm run migration:status

# Revert if needed
npm run migration:revert
```

## Commands

| Command | Description | CI/CD Use | Exit 1 on Error |
|---------|-------------|-----------|-----------------|
| `generate <name>` | Generate a new migration file | ❌ | ✅ |
| `up`, `run` | Run all pending migrations | ✅ | ✅ |
| `down`, `revert` | Revert the last migration | ⚠️ | ✅ |
| `down --count=<n>` | Revert the last N migrations | ⚠️ | ✅ |
| `down --to=<name>` | Revert to a specific migration | ⚠️ | ✅ |
| `status` | Show migration status (info only) | ❌ | ❌ |
| `check` | ⭐ Validate & check pending (exits 1) | ✅ | ✅ |
| `validate` | Validate files only (no DB) | ✅ | ✅ |
| `list` | List all migration files | ❌ | ❌ |

### Command Details

**Generate Migration:**
```bash
drizzle-tx-migrations generate create_users_table
drizzle-tx-migrations generate --name=add_email_column
```

**Run Migrations:**
```bash
drizzle-tx-migrations up
```

**Revert Migrations:**
```bash
# Revert last migration
drizzle-tx-migrations down

# Revert last 3 migrations
drizzle-tx-migrations down --count=3

# Revert to specific migration
drizzle-tx-migrations down --to=1702468800000_create_users_table
```

**Check Status (CI/CD):**
```bash
# Fails if pending migrations or validation errors
drizzle-tx-migrations check

# Only validate, don't fail on pending
drizzle-tx-migrations check --no-fail-pending
```

**Validate Files:**
```bash
# Validate without database connection
drizzle-tx-migrations validate
```

## Migration File Structure

Generated migration files follow this structure:

```typescript
import { type MigrationContext } from 'drizzle-tx-migrations';

/**
 * Migration: Create users table
 *
 * This migration runs in a transaction. If any operation fails,
 * all changes will be automatically rolled back.
 */

export async function up({ db, sql }: MigrationContext): Promise<void> {
  // Forward migration
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
  // Rollback migration
  await db.execute(sql`DROP TABLE IF EXISTS users`);
}

export default { up, down };
```

### Naming Convention

Migrations are automatically named with timestamp + description:
```
1702468800000_create_users_table.ts
1702468900000_add_email_index.ts
1702469000000_add_posts_table.ts
```

## TypeORM Comparison

### TypeORM Command
```bash
typeorm migration:generate Check --dryrun --check
```

### Equivalent in drizzle-tx-migrations
```bash
drizzle-tx-migrations check
```

**Both exit with code 1 if migrations are needed - perfect for CI/CD!**

| Feature | TypeORM | drizzle-tx-migrations |
|---------|---------|----------------------|
| `migration:generate --check` | ✅ | ✅ `check` |
| `migration:run` | ✅ | ✅ `up`, `run` |
| `migration:revert` | ✅ | ✅ `down`, `revert` |
| `migration:show` | ✅ | ✅ `status` |
| Validation command | ❌ | ✅ `validate` |
| Rollback to specific | ⚠️ | ✅ `--to=name` |

## Testing

### Running Unit Tests

```bash
npm install
npm run build
npm test
```

**Test Coverage:**
- ✅ 17 tests across 3 suites
- ✅ Generator (file creation, naming)
- ✅ Migrator (execution, tracking)
- ✅ Validator (syntax, conflicts)

### Testing with Local Database

#### SQLite (No Setup)

```bash
mkdir test-project && cd test-project
npm init -y
npm install drizzle-orm better-sqlite3 drizzle-tx-migrations

# Create config file (see Quick Start)
npx drizzle-tx-migrations generate create_users
npx drizzle-tx-migrations up
```

#### PostgreSQL with Docker

```bash
# Start PostgreSQL
docker run --name postgres-test \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=test_db \
  -p 5432:5432 \
  -d postgres:15

# Create config file and run migrations
npx drizzle-tx-migrations check
npx drizzle-tx-migrations up
```

#### MySQL with Docker

```bash
# Start MySQL
docker run --name mysql-test \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=test_db \
  -p 3306:3306 \
  -d mysql:8

# Create config file and run migrations
npx drizzle-tx-migrations check
npx drizzle-tx-migrations up
```

## CI/CD Integration

### GitHub Actions Example

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
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Check migrations
        run: npm run migration:check
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_USER: postgres
          DB_PASSWORD: postgres
          DB_NAME: test_db
```

### GitLab CI

```yaml
check-migrations:
  image: node:18
  services:
    - postgres:15
  variables:
    POSTGRES_DB: test_db
    POSTGRES_PASSWORD: postgres
    DB_HOST: postgres
  script:
    - npm ci
    - npm run build
    - npm run migration:check
```

### Pre-commit Hook

```bash
#!/bin/bash
# .husky/pre-commit

npm run migration:validate || {
  echo "❌ Migration validation failed"
  exit 1
}

echo "✅ Migrations validated"
```

## Migration Patterns

### Creating Tables

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      content TEXT,
      published BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add indexes
  await db.execute(sql`CREATE INDEX idx_posts_user_id ON posts(user_id)`);
  await db.execute(sql`CREATE INDEX idx_posts_created_at ON posts(created_at)`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS posts`);
}
```

### Adding Columns

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // Add column as nullable first
  await db.execute(sql`ALTER TABLE users ADD COLUMN phone VARCHAR(20)`);

  // Set default for existing rows
  await db.execute(sql`UPDATE users SET phone = '' WHERE phone IS NULL`);

  // Make it NOT NULL
  await db.execute(sql`ALTER TABLE users ALTER COLUMN phone SET NOT NULL`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`ALTER TABLE users DROP COLUMN phone`);
}
```

### Data Migrations

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // Insert initial data
  await db.execute(sql`
    INSERT INTO roles (name, permissions) VALUES
    ('admin', '{"read": true, "write": true, "delete": true}'),
    ('user', '{"read": true, "write": true, "delete": false}'),
    ('guest', '{"read": true, "write": false, "delete": false}')
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DELETE FROM roles WHERE name IN ('admin', 'user', 'guest')`);
}
```

### Complex Migrations

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // 1. Create new table
  await db.execute(sql`CREATE TABLE user_profiles (...)`);

  // 2. Migrate data
  await db.execute(sql`
    INSERT INTO user_profiles (user_id, bio, avatar)
    SELECT id, bio, avatar FROM users
  `);

  // 3. Drop old columns
  await db.execute(sql`ALTER TABLE users DROP COLUMN bio, DROP COLUMN avatar`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  // Reverse the process
  await db.execute(sql`ALTER TABLE users ADD COLUMN bio TEXT, ADD COLUMN avatar VARCHAR(500)`);

  await db.execute(sql`
    UPDATE users u
    SET bio = p.bio, avatar = p.avatar
    FROM user_profiles p
    WHERE u.id = p.user_id
  `);

  await db.execute(sql`DROP TABLE IF EXISTS user_profiles`);
}
```

## Transaction Behavior

All migrations run in transactions:

1. **On Success**: Changes are committed automatically
2. **On Failure**: All changes are rolled back automatically
3. **Atomic Operations**: Each migration is atomic - either fully applied or fully rolled back

**Example:**
```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // These operations run in a transaction
  await db.execute(sql`CREATE TABLE posts (...)`);
  await db.execute(sql`CREATE INDEX idx_posts_user ON posts(user_id)`);
  await db.execute(sql`INSERT INTO posts (...) VALUES (...)`);

  // If ANY operation fails, ALL changes are rolled back
}
```

## Programmatic Usage

You can also use the migration system programmatically:

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Migrator, MigrationGenerator } from 'drizzle-tx-migrations';

const pool = new Pool({ /* config */ });
const db = drizzle(pool);

const migrator = new Migrator({
  db,
  dialect: 'postgresql',
  config: {
    migrationsFolder: './migrations',
  },
});

// Run migrations
const result = await migrator.runMigrations();
console.log('Executed:', result.executed);

// Revert migrations
await migrator.revertMigration(1);

// Revert to specific migration
await migrator.revertTo('1234567890_create_users_table');

// Check status
const status = await migrator.getStatus();
console.log('Executed:', status.executed.length);
console.log('Pending:', status.pending.length);

// Generate migration
const generator = new MigrationGenerator('./migrations');
const filePath = generator.generateMigration('add_posts_table');
```

## Troubleshooting

### Migration fails but table still created

Some databases (like MySQL) don't support transactional DDL for all operations.

**Solution:** Break into smaller migrations if needed.

### "Migration already executed"

Check your migrations table:
```sql
SELECT * FROM __drizzle_migrations;
```

Manually remove if needed:
```sql
DELETE FROM __drizzle_migrations WHERE name = 'migration_name';
```

### TypeScript import errors

Ensure your `tsconfig.json` has proper module resolution:
```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

### Transaction not rolling back

- Some DDL statements auto-commit in MySQL
- Check if running in WAL mode for SQLite
- Verify transaction support for your database

## Best Practices

1. **Always test migrations locally first**
2. **Write reversible migrations**: Ensure `down()` properly reverts `up()`
3. **Keep migrations small**: One logical change per migration
4. **Use transactions**: They're automatic, but be aware of limitations
5. **Backup before production**: Always backup your database first
6. **Version control**: Commit migration files to git
7. **Test both directions**: Run up, then down, then up again
8. **Use `check` in CI/CD**: Catch missing migrations early

## API Reference

### Migrator

```typescript
class Migrator {
  constructor(options: MigratorOptions)

  async initialize(): Promise<void>
  async runMigrations(): Promise<{ success: boolean; executed: string[] }>
  async revertMigration(count: number): Promise<{ success: boolean; reverted: string[] }>
  async revertTo(targetName: string): Promise<{ success: boolean; reverted: string[] }>
  async getStatus(): Promise<{ executed: MigrationMeta[]; pending: string[] }>
}
```

### MigrationGenerator

```typescript
class MigrationGenerator {
  constructor(migrationsFolder: string)

  generateMigration(name: string): string
  listMigrations(): string[]
}
```

### MigrationValidator

```typescript
class MigrationValidator {
  constructor(migrationsFolder: string)

  async validate(): Promise<ValidationResult>
  checkForConflicts(executedMigrations: string[]): ValidationResult
  async check(getStatus: () => Promise<any>, options?: { failOnPending?: boolean }): Promise<CheckResult>
}
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

## License

MIT

## Credits

- Inspired by [TypeORM](https://typeorm.io/) migration system
- Built upon [Drizzle ORM](https://orm.drizzle.team/)
- Created with assistance from [Claude AI](https://claude.ai) (Anthropic)

## Support

- Report bugs: [GitHub Issues](https://github.com/yourusername/drizzle-tx-migrations/issues)
- Questions: Open a discussion on GitHub

---

**Made with ❤️ and Claude AI**
