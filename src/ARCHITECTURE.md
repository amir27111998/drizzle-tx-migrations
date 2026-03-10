# Architecture Guide

This guide helps you understand how the codebase is organized and how components work together.

## Quick Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI (cli.ts)                            │
│                    User commands entry point                    │
└─────────────────────────────────────────────────────────────────┘
                                 │
                 ┌───────────────┼───────────────┐
                 ▼               ▼               ▼
         ┌───────────┐   ┌─────────────┐   ┌───────────┐
         │  Migrator │   │  Generator  │   │ Validator │
         │           │   │             │   │           │
         │ Run/revert│   │Create files │   │Check files│
         │migrations │   │from schema  │   │& DB state │
         └─────┬─────┘   └──────┬──────┘   └───────────┘
               │                │
               │    ┌───────────┴───────────┐
               │    ▼                       ▼
               │  ┌─────────────┐   ┌─────────────┐
               │  │   Schema    │   │   Schema    │
               │  │ Introspector│   │   Loader    │
               │  │             │   │             │
               │  │Read DB state│   │Read Drizzle │
               │  │             │   │schema files │
               │  └──────┬──────┘   └──────┬──────┘
               │         │                 │
               │         └────────┬────────┘
               │                  ▼
               │         ┌─────────────┐
               │         │   Schema    │
               │         │   Differ    │
               │         │             │
               │         │Compare & get│
               │         │  changes    │
               │         └──────┬──────┘
               │                │
               │                ▼
               │         ┌─────────────┐
               │         │    SQL      │
               │         │  Generator  │
               │         │             │
               │         │Create UP/   │
               │         │DOWN SQL     │
               │         └─────────────┘
               │
               ▼
        ┌─────────────┐
        │  Migration  │
        │   Table     │
        │             │
        │Track what's │
        │  executed   │
        └─────────────┘
```

## File Responsibilities

| File | What it does | When you'd modify it |
|------|--------------|---------------------|
| `cli.ts` | Parses commands, calls other components | Adding new CLI commands |
| `migrator.ts` | Runs/reverts migrations with transactions | Changing execution logic |
| `generator.ts` | Creates migration files | Changing file templates |
| `migration-table.ts` | Tracks executed migrations in DB | Changing tracking table |
| `schema-introspector.ts` | Reads current DB schema | Adding new DB types |
| `schema-loader.ts` | Parses Drizzle schema files | Changing schema parsing |
| `schema-differ.ts` | Compares two schemas | Changing diff logic |
| `sql-generator.ts` | Generates SQL statements | Adding SQL for new types |
| `validator.ts` | Validates migration files | Adding validation rules |

## Utilities (`utils/`)

| File | What it does |
|------|--------------|
| `dialect-utils.ts` | Quote identifiers for each DB (`"` vs `` ` ``) |
| `type-normalizer.ts` | Normalize DB types (`VARCHAR` → `varchar`) |
| `result-normalizer.ts` | Handle different DB driver result formats |
| `sql-string.ts` | Escape SQL for template literals |
| `path-resolver.ts` | Resolve file paths, create directories |

## How Things Work

### Running Migrations

```
User runs: npx drizzle-migrate run

1. CLI parses command
2. Migrator loads config
3. MigrationTable checks what's already run
4. Migrator finds pending migrations (files not in DB)
5. For each migration:
   - Load the .ts/.js file
   - Start transaction (if enabled)
   - Call up() function
   - Record in migration table
   - Commit transaction
6. Done!
```

### Auto-Generating Migrations

```
User runs: npx drizzle-migrate generate add_users_table

1. CLI parses command
2. Generator loads config
3. SchemaIntrospector reads current DB → DatabaseSchema
4. SchemaLoader reads Drizzle files → DatabaseSchema
5. SchemaDiffer compares them → SchemaChange[]
6. SqlGenerator creates SQL → up[] and down[]
7. Generator writes migration file
8. Done!
```

### Schema Change Types

```typescript
type SchemaChange =
  | 'create_table'    // New table
  | 'drop_table'      // Remove table
  | 'alter_table'     // Add/remove/modify columns
  | 'create_index'    // New index
  | 'drop_index'      // Remove index
  | 'add_foreign_key' // New FK constraint
  | 'drop_foreign_key'// Remove FK constraint
```

## Database Support

| Feature | PostgreSQL | MySQL | SQLite |
|---------|------------|-------|--------|
| Introspection | ✅ | ✅ | ✅ |
| Auto-generation | ✅ | ✅ | ✅ |
| ALTER TABLE | ✅ | ✅ | ⚠️ Table recreation |
| Transactions | ✅ | ✅ | ✅ |

**SQLite Note:** SQLite has limited ALTER TABLE support. When modifying columns, we use the "table recreation" pattern:
1. Rename old table
2. Create new table with desired schema
3. Copy data
4. Drop old table

## Key Patterns

### Transaction Modes

```typescript
// In config or per-migration
transactionMode: 'each' | 'all' | 'none'

// 'each' (default): Each migration in its own transaction
// 'all': All migrations in one transaction (all-or-nothing)
// 'none': No transactions (for operations that can't be transactional)

// Per-migration override:
export const transaction = false; // Disables transaction for this migration
```

### Type Normalization

Database types need normalization because:
- PostgreSQL says `character varying`, we want `varchar`
- MySQL says `int`, PostgreSQL says `integer`
- Drizzle says `serial`, we need `integer` with auto-increment

All normalization happens in `utils/type-normalizer.ts`.

### Quoting Identifiers

```typescript
// PostgreSQL/SQLite use double quotes
"table_name"

// MySQL uses backticks
`table_name`

// Use the quote() utility:
import { quote } from './utils/dialect-utils';
quote('users', 'postgresql') // → "users"
quote('users', 'mysql')      // → `users`
```

## Adding New Features

### New CLI Command

1. Add case in `cli.ts` switch statement
2. Create handler function
3. Add to help text

### New Database Type

1. Add to `POSTGRESQL_TYPE_MAP` / `MYSQL_TYPE_MAP` in `type-normalizer.ts`
2. Add SQL generation in `sql-generator.ts` → `getColumnType()`
3. Add tests

### New Dialect (e.g., SQL Server)

1. Add `'sqlserver'` to `DbDialect` type
2. Add introspection method in `schema-introspector.ts`
3. Add SQL generation cases in `sql-generator.ts`
4. Add quote character in `constants.ts`
5. Update `migration-table.ts` for dialect-specific SQL

## Testing

```bash
# Unit tests (fast, no DB needed)
npm test

# Integration tests (needs Docker databases)
npm run test:integration

# All tests
npm run test:all
```

## Common Issues

**"Migration already exists"**
→ Check `__drizzle_migrations` table, migration might be recorded but file deleted

**"No schema changes detected"**
→ Schema files might not be loading. Check paths in config.

**"Cannot alter column in SQLite"**
→ Expected. SQLite uses table recreation automatically.

**"Transaction failed"**
→ Check if migration has `export const transaction = false` for operations like `CREATE INDEX CONCURRENTLY`
