# Migration Patterns and Best Practices

This guide covers common migration patterns and best practices when using drizzle-tx-migrations.

## Table of Contents

1. [Creating Tables](#creating-tables)
2. [Modifying Tables](#modifying-tables)
3. [Data Migrations](#data-migrations)
4. [Indexes and Constraints](#indexes-and-constraints)
5. [Complex Migrations](#complex-migrations)
6. [Database-Specific Patterns](#database-specific-patterns)
7. [Best Practices](#best-practices)

## Creating Tables

### Basic Table Creation

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
```

### Table with Foreign Keys

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title VARCHAR(500) NOT NULL,
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_posts_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS posts`);
}
```

### Table with Enums (PostgreSQL)

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // Create enum type
  await db.execute(sql`
    CREATE TYPE user_role AS ENUM ('admin', 'user', 'guest')
  `);

  // Create table with enum
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      role user_role DEFAULT 'user'
    )
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS users`);
  await db.execute(sql`DROP TYPE IF EXISTS user_role`);
}
```

## Modifying Tables

### Adding Columns

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users
    ADD COLUMN phone VARCHAR(20),
    ADD COLUMN address TEXT
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users
    DROP COLUMN phone,
    DROP COLUMN address
  `);
}
```

### Adding Column with Default Value

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users
    ADD COLUMN is_active BOOLEAN DEFAULT true NOT NULL
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users
    DROP COLUMN is_active
  `);
}
```

### Renaming Columns

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users
    RENAME COLUMN name TO full_name
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users
    RENAME COLUMN full_name TO name
  `);
}
```

### Changing Column Types

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // PostgreSQL
  await db.execute(sql`
    ALTER TABLE users
    ALTER COLUMN phone TYPE VARCHAR(50)
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users
    ALTER COLUMN phone TYPE VARCHAR(20)
  `);
}
```

### Making Column Nullable/Not Nullable

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users
    ALTER COLUMN phone DROP NOT NULL
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users
    ALTER COLUMN phone SET NOT NULL
  `);
}
```

## Data Migrations

### Inserting Initial Data

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    INSERT INTO roles (name, permissions) VALUES
    ('admin', '{"read": true, "write": true, "delete": true}'),
    ('user', '{"read": true, "write": true, "delete": false}'),
    ('guest', '{"read": true, "write": false, "delete": false}')
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    DELETE FROM roles WHERE name IN ('admin', 'user', 'guest')
  `);
}
```

### Updating Existing Data

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // First, add the new column
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active'
  `);

  // Then, update existing rows based on conditions
  await db.execute(sql`
    UPDATE users
    SET status = CASE
      WHEN last_login > NOW() - INTERVAL '30 days' THEN 'active'
      WHEN last_login > NOW() - INTERVAL '90 days' THEN 'inactive'
      ELSE 'dormant'
    END
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`ALTER TABLE users DROP COLUMN status`);
}
```

### Transforming Data

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // Split name into first_name and last_name
  await db.execute(sql`ALTER TABLE users ADD COLUMN first_name VARCHAR(255)`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN last_name VARCHAR(255)`);

  await db.execute(sql`
    UPDATE users
    SET
      first_name = SPLIT_PART(name, ' ', 1),
      last_name = SPLIT_PART(name, ' ', 2)
  `);

  await db.execute(sql`ALTER TABLE users DROP COLUMN name`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`ALTER TABLE users ADD COLUMN name VARCHAR(255)`);

  await db.execute(sql`
    UPDATE users
    SET name = CONCAT(first_name, ' ', last_name)
  `);

  await db.execute(sql`ALTER TABLE users DROP COLUMN first_name`);
  await db.execute(sql`ALTER TABLE users DROP COLUMN last_name`);
}
```

## Indexes and Constraints

### Adding Indexes

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`CREATE INDEX idx_users_email ON users(email)`);
  await db.execute(sql`CREATE INDEX idx_users_created_at ON users(created_at)`);

  // Composite index
  await db.execute(sql`
    CREATE INDEX idx_posts_user_created ON posts(user_id, created_at)
  `);

  // Partial index (PostgreSQL)
  await db.execute(sql`
    CREATE INDEX idx_users_active_email ON users(email)
    WHERE is_active = true
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS idx_users_email`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_users_created_at`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_posts_user_created`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_users_active_email`);
}
```

### Adding Unique Constraints

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users
    ADD CONSTRAINT unique_users_email UNIQUE (email)
  `);

  // Composite unique constraint
  await db.execute(sql`
    ALTER TABLE user_roles
    ADD CONSTRAINT unique_user_role UNIQUE (user_id, role_id)
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users DROP CONSTRAINT unique_users_email
  `);
  await db.execute(sql`
    ALTER TABLE user_roles DROP CONSTRAINT unique_user_role
  `);
}
```

### Adding Foreign Keys

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE posts
    ADD CONSTRAINT fk_posts_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE posts DROP CONSTRAINT fk_posts_user
  `);
}
```

### Adding Check Constraints

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE products
    ADD CONSTRAINT check_positive_price CHECK (price > 0)
  `);

  await db.execute(sql`
    ALTER TABLE users
    ADD CONSTRAINT check_valid_age CHECK (age >= 18 AND age <= 120)
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE products DROP CONSTRAINT check_positive_price
  `);
  await db.execute(sql`
    ALTER TABLE users DROP CONSTRAINT check_valid_age
  `);
}
```

## Complex Migrations

### Creating Multiple Related Tables

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // Create users table
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create posts table with foreign key
  await db.execute(sql`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create comments table with foreign keys
  await db.execute(sql`
    CREATE TABLE comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add indexes
  await db.execute(sql`CREATE INDEX idx_posts_user_id ON posts(user_id)`);
  await db.execute(sql`CREATE INDEX idx_comments_post_id ON comments(post_id)`);
  await db.execute(sql`CREATE INDEX idx_comments_user_id ON comments(user_id)`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  // Drop in reverse order to handle foreign keys
  await db.execute(sql`DROP TABLE IF EXISTS comments`);
  await db.execute(sql`DROP TABLE IF EXISTS posts`);
  await db.execute(sql`DROP TABLE IF EXISTS users`);
}
```

### Renaming Tables

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`ALTER TABLE user RENAME TO users`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`ALTER TABLE users RENAME TO user`);
}
```

### Splitting Tables

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // Create new profiles table
  await db.execute(sql`
    CREATE TABLE user_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bio TEXT,
      avatar_url VARCHAR(500),
      website VARCHAR(500)
    )
  `);

  // Migrate data from users to profiles
  await db.execute(sql`
    INSERT INTO user_profiles (user_id, bio, avatar_url, website)
    SELECT id, bio, avatar_url, website FROM users
  `);

  // Remove columns from users
  await db.execute(sql`
    ALTER TABLE users
    DROP COLUMN bio,
    DROP COLUMN avatar_url,
    DROP COLUMN website
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  // Add columns back to users
  await db.execute(sql`
    ALTER TABLE users
    ADD COLUMN bio TEXT,
    ADD COLUMN avatar_url VARCHAR(500),
    ADD COLUMN website VARCHAR(500)
  `);

  // Migrate data back
  await db.execute(sql`
    UPDATE users u
    SET
      bio = p.bio,
      avatar_url = p.avatar_url,
      website = p.website
    FROM user_profiles p
    WHERE u.id = p.user_id
  `);

  // Drop profiles table
  await db.execute(sql`DROP TABLE IF EXISTS user_profiles`);
}
```

## Database-Specific Patterns

### PostgreSQL Full-Text Search

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // Add tsvector column
  await db.execute(sql`
    ALTER TABLE posts ADD COLUMN search_vector tsvector
  `);

  // Create trigger to automatically update search vector
  await db.execute(sql`
    CREATE TRIGGER posts_search_vector_update
    BEFORE INSERT OR UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION
    tsvector_update_trigger(search_vector, 'pg_catalog.english', title, content)
  `);

  // Create GIN index for fast searching
  await db.execute(sql`
    CREATE INDEX idx_posts_search ON posts USING GIN (search_vector)
  `);

  // Update existing rows
  await db.execute(sql`
    UPDATE posts
    SET search_vector = to_tsvector('english', title || ' ' || COALESCE(content, ''))
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP TRIGGER IF EXISTS posts_search_vector_update ON posts`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_posts_search`);
  await db.execute(sql`ALTER TABLE posts DROP COLUMN search_vector`);
}
```

### MySQL JSON Column

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users
    ADD COLUMN preferences JSON DEFAULT '{}'
  `);

  // Add index on JSON field (MySQL 5.7+)
  await db.execute(sql`
    CREATE INDEX idx_users_preferences_email
    ON users ((CAST(preferences->>'$.emailNotifications' AS UNSIGNED)))
  `);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP INDEX idx_users_preferences_email ON users`);
  await db.execute(sql`ALTER TABLE users DROP COLUMN preferences`);
}
```

### SQLite Limitations Workaround

SQLite doesn't support many ALTER TABLE operations, so you need to recreate the table:

```typescript
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // Create new table with desired schema
  await db.execute(sql`
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,  -- New column
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Copy data
  await db.execute(sql`
    INSERT INTO users_new (id, name, email, created_at)
    SELECT id, name, email, created_at FROM users
  `);

  // Drop old table
  await db.execute(sql`DROP TABLE users`);

  // Rename new table
  await db.execute(sql`ALTER TABLE users_new RENAME TO users`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  // Similar process in reverse
  await db.execute(sql`
    CREATE TABLE users_old (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(sql`
    INSERT INTO users_old (id, name, email, created_at)
    SELECT id, name, email, created_at FROM users
  `);

  await db.execute(sql`DROP TABLE users`);
  await db.execute(sql`ALTER TABLE users_old RENAME TO users`);
}
```

## Best Practices

### 1. Keep Migrations Atomic

Each migration should represent one logical change:

```typescript
// ✅ Good - One logical change
// migration: add_user_email_column.ts
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`ALTER TABLE users ADD COLUMN email VARCHAR(255)`);
}

// ❌ Bad - Multiple unrelated changes
// migration: various_changes.ts
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`ALTER TABLE users ADD COLUMN email VARCHAR(255)`);
  await db.execute(sql`ALTER TABLE posts ADD COLUMN status VARCHAR(20)`);
  await db.execute(sql`CREATE TABLE categories (...)`);
}
```

### 2. Always Write Reversible Migrations

```typescript
// ✅ Good - Fully reversible
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`ALTER TABLE users ADD COLUMN phone VARCHAR(20)`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`ALTER TABLE users DROP COLUMN phone`);
}

// ❌ Bad - Not reversible (data loss)
export async function down({ db, sql }: MigrationContext): Promise<void> {
  // Can't recover data!
  await db.execute(sql`ALTER TABLE users DROP COLUMN phone`);
}
```

### 3. Handle Existing Data Carefully

```typescript
// ✅ Good - Handles existing data
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // Add column as nullable first
  await db.execute(sql`ALTER TABLE users ADD COLUMN status VARCHAR(20)`);

  // Set default value for existing rows
  await db.execute(sql`UPDATE users SET status = 'active' WHERE status IS NULL`);

  // Now make it NOT NULL
  await db.execute(sql`ALTER TABLE users ALTER COLUMN status SET NOT NULL`);
}
```

### 4. Use Descriptive Migration Names

```typescript
// ✅ Good names
// 1702468800000_create_users_table.ts
// 1702468900000_add_email_index_to_users.ts
// 1702469000000_add_cascade_delete_to_posts.ts

// ❌ Bad names
// 1702468800000_migration.ts
// 1702468900000_update.ts
// 1702469000000_fix.ts
```

### 5. Test Migrations Both Ways

Always test both `up` and `down`:

```bash
# Test up
npm run migration:run

# Verify data
psql -d mydb -c "SELECT * FROM users LIMIT 5"

# Test down
npm run migration:revert

# Verify rollback
psql -d mydb -c "SELECT * FROM users LIMIT 5"

# Re-run up
npm run migration:run
```

### 6. Backup Before Production

```bash
# PostgreSQL
pg_dump mydb > backup_$(date +%Y%m%d_%H%M%S).sql

# MySQL
mysqldump mydb > backup_$(date +%Y%m%d_%H%M%S).sql

# SQLite
cp db.sqlite db_backup_$(date +%Y%m%d_%H%M%S).sqlite
```

### 7. Use Transactions Wisely

Remember that transactions are automatic, but:

- Some DDL operations can't be rolled back (varies by database)
- Long-running migrations may lock tables
- Break very large migrations into smaller ones

### 8. Document Complex Migrations

```typescript
/**
 * Migration: Normalize user addresses
 *
 * This migration:
 * 1. Creates a new addresses table
 * 2. Migrates address data from users table
 * 3. Removes address columns from users
 * 4. Adds foreign key relationship
 *
 * NOTE: This migration may take a while on large datasets
 * NOTE: Ensure backup before running in production
 */
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // Implementation
}
```

## Troubleshooting Common Issues

### Issue: Foreign Key Constraint Violations

```typescript
// Solution: Disable foreign key checks temporarily (if needed)
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // PostgreSQL
  await db.execute(sql`SET CONSTRAINTS ALL DEFERRED`);

  // Your migration logic
  // ...

  // Constraints are checked at commit time
}
```

### Issue: Locking on Large Tables

```typescript
// Solution: Use CONCURRENTLY for index creation (PostgreSQL)
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // This won't lock the table
  await db.execute(sql`
    CREATE INDEX CONCURRENTLY idx_users_email ON users(email)
  `);
}
```

### Issue: Migration Takes Too Long

```typescript
// Solution: Break into smaller migrations or use batching
export async function up({ db, sql }: MigrationContext): Promise<void> {
  // Process in batches
  let processed = 0;
  const batchSize = 1000;

  while (true) {
    const result = await db.execute(sql`
      UPDATE users
      SET status = 'active'
      WHERE status IS NULL
      LIMIT ${batchSize}
    `);

    processed += result.rowCount || 0;

    if ((result.rowCount || 0) < batchSize) {
      break;
    }

    console.log(`Processed ${processed} rows...`);
  }
}
```

This guide should help you handle most common migration scenarios!
