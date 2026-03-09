# Drizzle TX Migrations

TypeORM-like migrations for Drizzle ORM with full transaction support and individual rollback control.

[![npm version](https://img.shields.io/npm/v/drizzle-tx-migrations.svg)](https://www.npmjs.com/package/drizzle-tx-migrations)
[![CI](https://github.com/amir27111998/drizzle-tx-migrations/actions/workflows/ci.yml/badge.svg)](https://github.com/amir27111998/drizzle-tx-migrations/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-107%20passing-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/amir27111998/drizzle-tx-migrations/blob/main/LICENSE)

## What's New in v1.2.0 🎉

**Drizzle-Kit Import Support!** This release adds the ability to import existing drizzle-kit migrations.

**New Features:**

- 📥 **Import Command** - Convert drizzle-kit SQL migrations to TypeScript/JavaScript with up/down functions
- 🔄 **Auto-Generated Down Migrations** - Reverse operations for CREATE TABLE, ADD CONSTRAINT, CREATE INDEX
- 📋 **Mark as Executed** - Option to mark imported migrations as already run

**Previous Features (v1.1.0):**

- 🎭 **Fake Migrations** (`--fake`) - Mark migrations as run without executing SQL
- 🔄 **Transaction Modes** (`--transaction=all|each|none`) - Full transaction control
- ⚙️ **Per-Migration Transaction** - Override transaction mode per migration file
- 🔄 **Schema Commands** - `schema:sync`, `schema:log`, `schema:drop` for direct schema management
- 📋 **Query Command** - Execute raw SQL queries directly
- 👁️ **Dry Run Mode** (`--dry-run`) - Preview migrations without executing
- 📄 **JavaScript Output** (`-o`) - Generate JS migration files instead of TypeScript

**Previous Features (v1.0.3):**

- 🔄 **Schema Introspection** - Automatically reads your database schema (PostgreSQL, MySQL, SQLite)
- 📊 **Schema Diffing** - Detects differences between database and Drizzle entities
- ⚡ **Auto-Generated SQL** - Creates both `up()` and `down()` migrations automatically
- 🗂️ **Multi-File Schemas** - Supports individual files, directories, and glob patterns (`**/*.ts`)
- 📁 **Directory Support** - Point to a folder and auto-discover all schema files
- ✨ **Dialect-Specific** - Generates optimal SQL for each database type

[Jump to Auto-Generation Guide](#auto-generation-from-schema-changes)

## Features

- ✅ **Auto-Generation** - Automatically generate migrations from schema changes (like TypeORM)
- ✅ **Transaction Support** - All migrations run in transactions with automatic rollback
- ✅ **TypeORM-like Interface** - Familiar `up()` and `down()` methods
- ✅ **Individual Rollback** - Revert specific migrations, not just batches
- ✅ **CI/CD Ready** - `check` command exits with code 1 if migrations pending
- ✅ **Multi-Database** - PostgreSQL, MySQL, and SQLite support
- ✅ **Type-Safe** - Full TypeScript support
- ✅ **CLI & Programmatic** - Use via CLI or directly in code

## Installation

```bash
npm install drizzle-tx-migrations drizzle-orm
```

Install your database driver:

```bash
# PostgreSQL
npm install pg

# MySQL
npm install mysql2

# SQLite
npm install better-sqlite3
```

## Quick Start

### 1. Create Configuration

Create `drizzle-migrations.config.ts`:

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Migrator, MigrationGenerator } from 'drizzle-tx-migrations';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'mydb',
});

const db = drizzle(pool);

export const migrator = new Migrator({
  db,
  dialect: 'postgresql',
  config: { migrationsFolder: './migrations' },
});

export const generator = new MigrationGenerator('./migrations');
export default { migrator, generator };
```

### 2. Generate Migration

```bash
npx drizzle-tx-migrations generate create_users_table
```

### 3. Write Migration

Edit the generated file in `migrations/`:

```typescript
import { MigrationContext } from 'drizzle-tx-migrations';

export async function up({ db, sql }: MigrationContext) {
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

export async function down({ db, sql }: MigrationContext) {
  await db.execute(sql`DROP TABLE users`);
}

export default { up, down };
```

### 4. Run Migration

```bash
npx drizzle-tx-migrations up
```

## Auto-Generation from Schema Changes

🎉 **New!** Automatically generate migrations by comparing your Drizzle schema with your database state - just like TypeORM!

### Setup for Auto-Generation

Update your `drizzle-migrations.config.ts` to pass schema information to the generator:

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Migrator, MigrationGenerator } from 'drizzle-tx-migrations';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'mydb',
});

const db = drizzle(pool);

export const migrator = new Migrator({
  db,
  dialect: 'postgresql',
  config: { migrationsFolder: './migrations' },
});

// Enable auto-generation by passing db, dialect, and schema files
export const generator = new MigrationGenerator(
  './migrations', // migrations folder
  db, // database instance for introspection
  'postgresql', // database dialect
  ['./src/schema.ts'] // path(s) to your Drizzle schema files
);

export default { migrator, generator };
```

### How It Works

1. **Define your schema** in Drizzle:

```typescript
// src/schema.ts
import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
});
```

2. **Generate migration** - it will auto-detect changes:

```bash
npx drizzle-tx-migrations generate add_users_table
```

3. **Review the generated migration**:

```typescript
import { type MigrationContext } from 'drizzle-tx-migrations';

/**
 * Migration: add_users_table
 *
 * This migration was auto-generated from schema changes.
 * Please review the changes carefully before running the migration.
 *
 * Changes detected:
 * - Create table: users
 */

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "email" VARCHAR(255) NOT NULL,
  "name" VARCHAR(255),
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "users";`);
}

export default { up, down };
```

4. **Run the migration**:

```bash
npx drizzle-tx-migrations up
```

### What Gets Auto-Generated

The auto-generation system detects and creates SQL for:

- ✅ **Table Creation** - New tables from your schema
- ✅ **Table Drops** - Tables removed from schema
- ✅ **Column Changes** - Add, drop, or modify columns
- ✅ **Index Management** - Create or drop indexes
- ✅ **Foreign Keys** - Add or remove foreign key constraints
- ✅ **Down Migrations** - Automatically generates reverse operations

### Fallback Behavior

- **No schema files configured?** → Generates blank migration template
- **No schema changes detected?** → Generates blank migration template
- **Error during generation?** → Falls back to blank migration template

You can still create manual migrations for data migrations or complex operations!

### Multi-Schema Files & Directories

You can specify schema paths in multiple ways:

**Individual files:**
```typescript
export const generator = new MigrationGenerator('./migrations', db, 'postgresql', [
  './src/schema/users.ts',
  './src/schema/posts.ts',
]);
```

**Directory path** (automatically finds all `.ts` files):
```typescript
export const generator = new MigrationGenerator('./migrations', db, 'postgresql', [
  './src/schema', // Loads all .ts files in schema directory and subdirectories
]);
```

**Glob patterns:**
```typescript
export const generator = new MigrationGenerator('./migrations', db, 'postgresql', [
  './src/schema/**/*.ts', // All .ts files in schema and subdirectories
  './src/models/*.ts',     // All .ts files in models directory only
]);
```

**Mixed approaches:**
```typescript
export const generator = new MigrationGenerator('./migrations', db, 'postgresql', [
  './src/schema',           // Directory
  './src/models/**/*.ts',   // Glob pattern
  './src/legacy/old.ts',    // Individual file
]);
```

### Database Support

Auto-generation works with all supported databases:

- **PostgreSQL** - Full support for all features
- **MySQL** - Full support for all features
- **SQLite** - Partial support (some ALTER operations generate comments for manual review)

## Commands

### Migration Commands

| Command            | Description                                   |
| ------------------ | --------------------------------------------- |
| `generate <name>`  | Generate new migration file                   |
| `up`               | Run all pending migrations                    |
| `down`             | Rollback last migration                       |
| `down --count=<n>` | Rollback last N migrations                    |
| `down --to=<name>` | Rollback to specific migration                |
| `status`           | Show migration status                         |
| `check`            | Validate & check pending (exits 1 if pending) |
| `validate`         | Validate migration files only                 |
| `list`             | List all migration files                      |

### Import Commands

| Command           | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `import [folder]` | Import drizzle-kit migrations to TypeScript/JavaScript format       |

### Schema Commands

| Command       | Description                                            |
| ------------- | ------------------------------------------------------ |
| `schema:sync` | Synchronize database directly with Drizzle schema      |
| `schema:log`  | Show SQL that schema:sync would execute                |
| `schema:drop` | Drop all tables from database (requires `--force`)     |

### Query Commands

| Command          | Description                          |
| ---------------- | ------------------------------------ |
| `query "<sql>"`  | Execute raw SQL and display results  |

### Options

| Option                | Commands        | Description                                         |
| --------------------- | --------------- | --------------------------------------------------- |
| `--dry-run`           | up, down, sync  | Preview what would be done without executing        |
| `--fake` / `-f`       | up, down        | Mark migrations as run without executing SQL        |
| `--transaction=<mode>`| up, down        | Transaction mode: `all`, `each` (default), `none`   |
| `-o` / `--output-js`  | generate        | Generate JavaScript file instead of TypeScript      |
| `--force`             | schema:drop     | Required for destructive operations                 |
| `--no-fail-pending`   | check           | Don't fail if there are pending migrations          |
| `--from=<folder>`     | import          | Source folder for drizzle-kit migrations            |
| `--mark-executed`/`-e`| import          | Mark imported migrations as already executed        |

### Transaction Modes

- **`all`** - Wrap ALL migrations in a single transaction (all-or-nothing)
- **`each`** - Wrap EACH migration in its own transaction (default, TypeORM-like)
- **`none`** - Run migrations WITHOUT transaction wrapping

### Examples

```bash
# Generate migration
npx drizzle-tx-migrations generate add_user_role

# Generate JavaScript migration
npx drizzle-tx-migrations generate add_user_role -o

# Run all pending
npx drizzle-tx-migrations up

# Preview what would run
npx drizzle-tx-migrations up --dry-run

# Mark as run without executing (fake)
npx drizzle-tx-migrations up --fake

# Run with single transaction for all migrations
npx drizzle-tx-migrations up --transaction=all

# Rollback last migration
npx drizzle-tx-migrations down

# Rollback last 3 migrations
npx drizzle-tx-migrations down --count=3

# Rollback to specific migration
npx drizzle-tx-migrations down --to=1234567890_create_users

# Remove from tracking without running down() (fake revert)
npx drizzle-tx-migrations down --fake

# Check status (for CI/CD)
npx drizzle-tx-migrations check

# Execute raw SQL query
npx drizzle-tx-migrations query "SELECT * FROM users LIMIT 10"

# Preview schema sync
npx drizzle-tx-migrations schema:log

# Sync schema directly (bypasses migrations)
npx drizzle-tx-migrations schema:sync

# Drop all tables
npx drizzle-tx-migrations schema:drop --force

# Import drizzle-kit migrations
npx drizzle-tx-migrations import ./drizzle

# Import as JavaScript
npx drizzle-tx-migrations import ./drizzle -o

# Import and mark as already executed
npx drizzle-tx-migrations import ./drizzle --mark-executed
```

### Per-Migration Transaction Control

You can override the transaction mode for individual migrations by exporting a `transaction` constant:

```typescript
import { type MigrationContext } from 'drizzle-tx-migrations';

// Disable transaction for this migration (useful for operations that can't run in transactions)
export const transaction = false;

export async function up({ db, sql }: MigrationContext): Promise<void> {
  // This migration runs WITHOUT a transaction
  await db.execute(sql`CREATE INDEX CONCURRENTLY idx_users_email ON users(email)`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS idx_users_email`);
}

export default { up, down };
```

## Importing from Drizzle-Kit

Already have migrations created with `drizzle-kit`? You can import them to `drizzle-tx-migrations` format.

### How It Works

Drizzle-kit generates SQL migrations in a folder structure like:
```
drizzle/
├── 0000_initial.sql
├── 0001_add_posts.sql
└── meta/
    └── _journal.json
```

The import command converts these to TypeScript migrations with `up()` and `down()` functions.

### Import Steps

1. **Import your migrations:**
```bash
npx drizzle-tx-migrations import ./drizzle
```

2. **Review the generated migrations** in your migrations folder:
```typescript
// migrations/1773036597956_initial.ts
import { type MigrationContext } from 'drizzle-tx-migrations';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`CREATE TABLE \`users\` (...)`);
  await db.execute(sql`CREATE TABLE \`posts\` (...)`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS \`posts\``);
  await db.execute(sql`DROP TABLE IF EXISTS \`users\``);
}

export default { up, down };
```

3. **If migrations were already applied** to your database, mark them as executed:
```bash
npx drizzle-tx-migrations import ./drizzle --mark-executed
# or
npx drizzle-tx-migrations up --fake
```

### Auto-Generated Down Migrations

The importer automatically generates reverse statements for:
- **CREATE TABLE** → `DROP TABLE IF EXISTS`
- **ALTER TABLE ADD CONSTRAINT** → `ALTER TABLE DROP CONSTRAINT/FOREIGN KEY`
- **CREATE INDEX** → `DROP INDEX IF EXISTS`

For complex migrations, you may need to review and adjust the `down()` function.

### Import Options

```bash
# Import from custom folder
npx drizzle-tx-migrations import ./my-drizzle-folder

# Generate JavaScript instead of TypeScript
npx drizzle-tx-migrations import ./drizzle -o

# Mark as already executed (if migrations already ran)
npx drizzle-tx-migrations import ./drizzle --mark-executed
```

## CI/CD Integration

Use the `check` command in your CI pipeline:

```yaml
# .github/workflows/ci.yml
- name: Check migrations
  run: npx drizzle-tx-migrations check
```

Exits with code 1 if:

- Validation errors found
- Pending migrations exist

## Database Support

### PostgreSQL

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({
  /* config */
});
const db = drizzle(pool);

export const migrator = new Migrator({
  db,
  dialect: 'postgresql',
  config: { migrationsFolder: './migrations' },
});
```

### MySQL

```typescript
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  /* config */
});
const db = drizzle(connection);

export const migrator = new Migrator({
  db,
  dialect: 'mysql',
  config: { migrationsFolder: './migrations' },
});
```

### SQLite

```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('./db.sqlite');
const db = drizzle(sqlite);

export const migrator = new Migrator({
  db,
  dialect: 'sqlite',
  config: { migrationsFolder: './migrations' },
});
```

## Programmatic Usage

```typescript
import { migrator } from './drizzle-migrations.config';

// Run migrations
const result = await migrator.runMigrations();
console.log(result.success ? 'Success!' : 'Failed!');

// Run with options
await migrator.runMigrations({
  fake: true,           // Mark as run without executing
  dryRun: true,         // Preview only
  transactionMode: 'all' // Wrap all in single transaction
});

// Get status
const status = await migrator.getStatus();
console.log('Pending:', status.pending);
console.log('Executed:', status.executed);

// Rollback
await migrator.revertMigration();

// Rollback with options
await migrator.revertMigration(3, {  // Revert 3 migrations
  fake: true,           // Remove from tracking only
  transactionMode: 'none'
});

// Revert to specific migration
await migrator.revertTo('1234567890_create_users');
```

## Migration Patterns

### Schema Changes

```typescript
export async function up({ db, sql }: MigrationContext) {
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN last_login TIMESTAMP
  `);
}
```

### Data Migrations

```typescript
export async function up({ db, sql }: MigrationContext) {
  // Create column with default
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active'
  `);

  // Update existing data
  await db.execute(sql`
    UPDATE users SET status = 'inactive' WHERE last_login < NOW() - INTERVAL '1 year'
  `);
}
```

### Using Drizzle Schema

```typescript
import { users } from '../schema';

export async function up({ db }: MigrationContext) {
  await db.insert(users).values([{ email: 'admin@example.com', role: 'admin' }]);
}
```

## Examples

See the [`examples/`](./examples) directory for:

- [Local Development Setup](./examples/local-development) - Docker Compose setup
- [PostgreSQL](./examples/postgresql) - PostgreSQL configuration
- [MySQL](./examples/mysql) - MySQL configuration
- [SQLite](./examples/sqlite) - SQLite configuration
- [CI/CD Integration](./examples/ci-cd) - GitHub Actions, GitLab CI
- [Full Example](./examples/full-example) - Complete working project

## API Reference

### Migrator

```typescript
class Migrator {
  constructor(options: {
    db: any;
    dialect: 'postgresql' | 'mysql' | 'sqlite';
    config: {
      migrationsFolder: string;
      migrationsTable?: string;  // Custom table name (default: __drizzle_migrations)
      schemaFiles?: string[];    // For schema:sync commands
    };
  });

  // Run all pending migrations
  runMigrations(options?: {
    fake?: boolean;              // Mark as run without executing
    dryRun?: boolean;            // Preview only
    transactionMode?: 'all' | 'each' | 'none';
  }): Promise<{ success: boolean; executed: string[] }>;

  // Revert migrations
  revertMigration(count?: number, options?: {
    fake?: boolean;
    dryRun?: boolean;
    transactionMode?: 'all' | 'each' | 'none';
  }): Promise<{ success: boolean; reverted: string[] }>;

  // Revert to a specific migration
  revertTo(targetName: string, options?: {
    fake?: boolean;
    dryRun?: boolean;
    transactionMode?: 'all' | 'each' | 'none';
  }): Promise<{ success: boolean; reverted: string[] }>;

  // Get migration status
  getStatus(): Promise<{
    pending: string[];
    executed: MigrationMeta[]
  }>;
}
```

### MigrationGenerator

```typescript
class MigrationGenerator {
  constructor(
    migrationsFolder: string,
    db?: any,                    // Optional: for auto-generation
    dialect?: DbDialect,         // Optional: for auto-generation
    schemaFiles?: string[]       // Optional: paths to schema files
  );

  generateMigration(name: string, options?: {
    outputFormat?: 'ts' | 'js';  // Default: 'ts'
  }): Promise<string>;

  listMigrations(): string[];
}
```

**Parameters:**

- `migrationsFolder` - Path to migrations folder
- `db` - (Optional) Database instance for introspection
- `dialect` - (Optional) Database dialect ('postgresql' | 'mysql' | 'sqlite')
- `schemaFiles` - (Optional) Paths to Drizzle schema files

**Behavior:**

- With all parameters: Auto-generates migration from schema diff
- Without optional parameters: Generates blank migration template
- No schema changes: Falls back to blank template

### Types

```typescript
type TransactionMode = 'all' | 'each' | 'none';

interface RunMigrationsOptions {
  fake?: boolean;                    // Mark as run without executing
  transactionMode?: TransactionMode; // Default: 'each'
  dryRun?: boolean;                  // Preview only
}

interface RevertMigrationsOptions {
  fake?: boolean;                    // Remove from tracking only
  transactionMode?: TransactionMode; // Default: 'each'
  dryRun?: boolean;                  // Preview only
}

interface GeneratorOptions {
  outputFormat?: 'ts' | 'js';        // Default: 'ts'
}
```

## Publishing & Releases

This package uses **fully automated** publishing. When you push to `main`:

**Option 1: Auto-increment (easiest)**

- Just push to `main` without changing version
- GitHub Actions auto-increments patch version and publishes

**Option 2: Manual version bump**

```bash
npm version minor  # or major/patch
git push origin main
```

**How It Works:**

- `package.json version = latest tag` → Auto-increments patch
- `package.json version > latest tag` → Uses your version
- `package.json version < latest tag` → Fails with error

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

## License

MIT

## Credits

- Inspired by [TypeORM](https://typeorm.io/) migration system
- Built for [Drizzle ORM](https://orm.drizzle.team/)
- Auto-generation feature developed with [Claude Code](https://claude.com/claude-code)
- Created with assistance from [Claude AI](https://claude.ai)

## Support

- 📖 [Examples](./examples)
- 🐛 [Report Issues](https://github.com/amir27111998/drizzle-tx-migrations/issues)
- 💬 [Discussions](https://github.com/amir27111998/drizzle-tx-migrations/discussions)

---

**Made with ❤️ for the Drizzle community**
