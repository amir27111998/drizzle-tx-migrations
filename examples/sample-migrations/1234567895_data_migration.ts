import { type MigrationContext } from 'drizzle-tx-migrations';

/**
 * Migration: Data migration example
 *
 * This migration demonstrates:
 * - Combining schema changes with data transformations
 * - Safe data migrations with transactions
 * - Adding columns with defaults then updating existing data
 */

export async function up({ db, sql }: MigrationContext): Promise<void> {
  // Step 1: Add new column with default value
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active'
  `);

  // Step 2: Update existing data based on business logic
  await db.execute(sql`
    UPDATE users
    SET status = 'inactive'
    WHERE updated_at < NOW() - INTERVAL '1 year'
  `);

  // Step 3: Add NOT NULL constraint after data is populated
  await db.execute(sql`
    ALTER TABLE users ALTER COLUMN status SET NOT NULL
  `);

  console.log('  → Added status column and migrated data');
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`ALTER TABLE users DROP COLUMN status`);
  console.log('  → Removed status column');
}

export default { up, down };
