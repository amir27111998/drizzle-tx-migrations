import { type MigrationContext } from 'drizzle-tx-migrations';

/**
 * Migration: Create users table
 *
 * This migration runs in a transaction. If any operation fails,
 * all changes will be automatically rolled back.
 */

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('  → Created users table');
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS users`);
  console.log('  → Dropped users table');
}

export default { up, down };
