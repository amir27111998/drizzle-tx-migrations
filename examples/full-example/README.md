# Full Example - Drizzle TX Migrations

This is a complete example showing how to use drizzle-tx-migrations in a real project.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create your database:
```bash
createdb mydb
```

3. Copy environment file:
```bash
cp .env.example .env
```

4. Update `.env` with your database credentials

## Usage

### Generate migrations

```bash
# Generate a new migration
npm run migration:generate create_users_table

# Edit the migration file in ./migrations/
```

### Run migrations

```bash
# Run all pending migrations
npm run migration:run

# Check status
npm run migration:status
```

### Revert migrations

```bash
# Revert last migration
npm run migration:revert

# Revert last 3 migrations
drizzle-tx-migrations down --count=3

# Revert to specific migration
drizzle-tx-migrations down --to=1234567890_create_users_table
```

## Migration Workflow

1. **Make schema changes** in `schema.ts`
2. **Generate migration**: `npm run migration:generate <name>`
3. **Edit migration file** to implement up/down logic
4. **Test locally**: `npm run migration:run`
5. **Commit** migration files to version control
6. **Deploy**: Run migrations in production

## Example Migration Flow

```bash
# 1. Generate migrations for each table
npm run migration:generate create_users_table
npm run migration:generate create_posts_table
npm run migration:generate create_comments_table

# 2. Edit each migration file with proper SQL

# 3. Run all migrations
npm run migration:run

# 4. Check status
npm run migration:status
# Output:
# ✓ Executed migrations:
#   - 1234567890_create_users_table (2024-12-11 10:30:00)
#   - 1234567891_create_posts_table (2024-12-11 10:30:05)
#   - 1234567892_create_comments_table (2024-12-11 10:30:10)
#
# ⏳ Pending migrations: None
#
# Database is up to date.

# 5. If something goes wrong, revert
npm run migration:revert
```

## Notes

- All migrations run in transactions
- Failed migrations are automatically rolled back
- Each migration is tracked in `__drizzle_migrations` table
- You can revert individual migrations, not just batches
