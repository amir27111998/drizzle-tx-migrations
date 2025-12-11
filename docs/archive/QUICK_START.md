# Quick Start Guide

## Using Locally (Not Published Yet)

Since this package isn't published to npm yet, here's how to use it:

### Option 1: Build and Link Locally

```bash
# 1. Build the package
cd /Users/syedamirali/Desktop/drizzle-migrations
npm install
npm run build

# 2. Link it globally
npm link

# 3. In your project, link to it
cd /path/to/your/project
npm link drizzle-tx-migrations
```

### Option 2: Install as Local Dependency

In your project's `package.json`:

```json
{
  "dependencies": {
    "drizzle-tx-migrations": "file:../drizzle-migrations"
  }
}
```

Then run:
```bash
npm install
```

### Option 3: Publish to npm

To make this available for everyone:

```bash
# 1. Create npm account (if you don't have one)
npm adduser

# 2. Update package.json with your details
# Edit package.json and change the name if needed

# 3. Build the project
npm run build

# 4. Publish
npm publish --access public
```

## Using the Package

Once installed (via any method above):

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
  config: {
    migrationsFolder: './migrations',
  },
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
    "migration:status": "drizzle-tx-migrations status"
  }
}
```

### 3. Use It!

```bash
# Generate a migration
npm run migration:generate create_users_table

# Edit the migration file in ./migrations/

# Run migrations
npm run migration:run

# Check status
npm run migration:status

# Revert if needed
npm run migration:revert
```

## Key Features You Built

✅ **Transaction Support** - All migrations run in transactions with automatic rollback on failure

✅ **Individual Rollback** - Revert specific migrations, not just batches (fixes issue #7)

✅ **Multi-Database** - PostgreSQL, MySQL, and SQLite support (fixes issue #9)

✅ **Multi-File Schemas** - Support for schemas across multiple files (fixes issue #6)

✅ **TypeORM-like Interface** - Familiar `up()` and `down()` methods

✅ **Type-Safe** - Full TypeScript support

## Next Steps

1. **Test it locally** with your database
2. **Publish to npm** if you want to share it
3. **Add tests** (recommended before publishing)
4. **Add CI/CD** for automated testing
5. **Create GitHub repo** for community contributions

## Publishing to npm

```bash
# 1. Login to npm
npm login

# 2. Build
npm run build

# 3. Publish
npm publish --access public

# Your package will be available at:
# https://www.npmjs.com/package/drizzle-tx-migrations
```

Then anyone can install it with:
```bash
npm install drizzle-tx-migrations
```
