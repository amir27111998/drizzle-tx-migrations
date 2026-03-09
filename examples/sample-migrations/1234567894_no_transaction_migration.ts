import { type MigrationContext } from 'drizzle-tx-migrations';

/**
 * Migration: Create index concurrently (PostgreSQL)
 *
 * This migration demonstrates:
 * - Disabling transaction for operations that can't run in transactions
 * - CREATE INDEX CONCURRENTLY (PostgreSQL only)
 *
 * Note: This is PostgreSQL-specific. For MySQL/SQLite, use regular CREATE INDEX.
 */

// Disable transaction for this migration
// CREATE INDEX CONCURRENTLY cannot run inside a transaction
export const transaction = false;

export async function up({ db, sql }: MigrationContext): Promise<void> {
  // CONCURRENTLY allows the index to be built without blocking writes
  await db.execute(sql`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_lower
    ON users (LOWER(email))
  `);

  console.log('  → Created concurrent index on users(email)');
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS idx_users_email_lower`);
  console.log('  → Dropped concurrent index');
}

export default { up, down };
