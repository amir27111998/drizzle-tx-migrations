import { type MigrationContext } from 'drizzle-tx-migrations';

/**
 * Migration: Create posts table with various data types
 *
 * This migration demonstrates:
 * - Foreign key relationships
 * - JSON/JSONB columns
 * - Boolean columns
 * - Text columns
 */

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      slug VARCHAR(500) UNIQUE NOT NULL,
      content TEXT,
      metadata JSONB DEFAULT '{}',
      published BOOLEAN DEFAULT false NOT NULL,
      view_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(sql`CREATE INDEX idx_posts_user_id ON posts(user_id)`);
  await db.execute(sql`CREATE INDEX idx_posts_slug ON posts(slug)`);
  await db.execute(sql`CREATE INDEX idx_posts_published ON posts(published)`);

  console.log('  → Created posts table with indexes');
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS posts`);
  console.log('  → Dropped posts table');
}

export default { up, down };
