import { type MigrationContext } from 'drizzle-tx-migrations';

/**
 * Migration: Create products table with numeric data types
 *
 * This migration demonstrates:
 * - Decimal/numeric columns for prices
 * - Different integer types
 * - UUID columns
 */

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`
    CREATE TABLE products (
      id SERIAL PRIMARY KEY,
      sku UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10, 2) NOT NULL,
      cost NUMERIC(10, 2),
      quantity INTEGER DEFAULT 0 NOT NULL,
      weight_grams SMALLINT,
      rating REAL DEFAULT 0,
      is_active BOOLEAN DEFAULT true NOT NULL,
      metadata JSON,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(sql`CREATE INDEX idx_products_sku ON products(sku)`);
  await db.execute(sql`CREATE INDEX idx_products_is_active ON products(is_active)`);
  await db.execute(sql`CREATE INDEX idx_products_price ON products(price)`);

  console.log('  → Created products table with indexes');
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS products`);
  console.log('  → Dropped products table');
}

export default { up, down };
