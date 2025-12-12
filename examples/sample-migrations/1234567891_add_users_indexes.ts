import { type MigrationContext } from 'drizzle-tx-migrations';

/**
 * Migration: Add indexes to users table
 *
 * This migration runs in a transaction. If any operation fails,
 * all changes will be automatically rolled back.
 */

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`CREATE INDEX idx_users_email ON users(email)`);
  await db.execute(sql`CREATE INDEX idx_users_created_at ON users(created_at)`);

  console.log('  → Created indexes on users table');
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS idx_users_email`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_users_created_at`);

  console.log('  → Dropped indexes from users table');
}

export default { up, down };
