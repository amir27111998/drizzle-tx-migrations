# Drizzle TX Migrations

TypeORM-like migrations for Drizzle ORM with full transaction support and individual rollback control.

[![npm version](https://img.shields.io/npm/v/drizzle-tx-migrations.svg)](https://www.npmjs.com/package/drizzle-tx-migrations)
[![CI](https://github.com/amir27111998/drizzle-tx-migrations/actions/workflows/ci.yml/badge.svg)](https://github.com/amir27111998/drizzle-tx-migrations/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-99%20passing-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/amir27111998/drizzle-tx-migrations/blob/main/LICENSE)

## What's New in v1.0.3 🎉

**TypeORM-Style Auto-Generation** is now available! The library now automatically generates migrations by comparing your current database state with your Drizzle schema definitions - just like TypeORM's migration generation.

**New Features:**

- 🔄 **Schema Introspection** - Automatically reads your database schema (PostgreSQL, MySQL, SQLite)
- 📊 **Schema Diffing** - Detects differences between database and Drizzle entities
- ⚡ **Auto-Generated SQL** - Creates both `up()` and `down()` migrations automatically
- 🗂️ **Multi-File Schemas** - Supports Drizzle schemas spread across multiple files
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

### Multi-Schema Files

You can specify multiple schema files:

```typescript
export const generator = new MigrationGenerator('./migrations', db, 'postgresql', [
  './src/schema/users.ts',
  './src/schema/posts.ts',
  './src/schema/comments.ts',
]);
```

### Database Support

Auto-generation works with all supported databases:

- **PostgreSQL** - Full support for all features
- **MySQL** - Full support for all features
- **SQLite** - Partial support (some ALTER operations generate comments for manual review)

## Commands

| Command            | Description                                   |
| ------------------ | --------------------------------------------- |
| `generate <name>`  | Generate new migration file                   |
| `up`               | Run all pending migrations                    |
| `down`             | Rollback last migration                       |
| `down --to=<name>` | Rollback to specific migration                |
| `status`           | Show migration status                         |
| `check`            | Validate & check pending (exits 1 if pending) |
| `validate`         | Validate migration files only                 |

### Examples

```bash
# Generate migration
npx drizzle-tx-migrations generate add_user_role

# Run all pending
npx drizzle-tx-migrations up

# Rollback last migration
npx drizzle-tx-migrations down

# Rollback to specific migration
npx drizzle-tx-migrations down --to=1234567890_create_users

# Check status (for CI/CD)
npx drizzle-tx-migrations check
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

// Get status
const status = await migrator.getStatus();
console.log('Pending:', status.pending);
console.log('Executed:', status.executed);

// Rollback
await migrator.rollbackMigration();
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
    config: { migrationsFolder: string };
  });

  runMigrations(): Promise<{ success: boolean; error?: string }>;
  rollbackMigration(options?: { to?: string }): Promise<{ success: boolean }>;
  getStatus(): Promise<{ pending: Migration[]; executed: Migration[] }>;
}
```

### MigrationGenerator

```typescript
class MigrationGenerator {
  constructor(
    migrationsFolder: string,
    db?: any, // Optional: for auto-generation
    dialect?: DbDialect, // Optional: for auto-generation
    schemaFiles?: string[] // Optional: paths to schema files
  );

  generateMigration(name: string): Promise<string>;
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
