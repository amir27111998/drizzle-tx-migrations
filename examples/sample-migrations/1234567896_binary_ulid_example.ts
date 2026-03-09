import { type MigrationContext } from 'drizzle-tx-migrations';

/**
 * Migration: Binary and ULID column examples
 *
 * This migration demonstrates:
 * - Using binary columns for ULID storage
 * - Storing binary data (images, files, etc.)
 * - Database-specific binary type syntax
 *
 * ULIDs are 128-bit identifiers that can be stored as:
 * - VARCHAR(26) for string representation
 * - BINARY(16) / BYTEA for compact binary storage
 */

export async function up({ db, sql }: MigrationContext): Promise<void> {
  // PostgreSQL syntax - uses BYTEA for binary data
  // For MySQL, replace BYTEA with BINARY(16) or VARBINARY
  // For SQLite, use BLOB

  await db.execute(sql`
    CREATE TABLE files (
      -- ULID as binary (16 bytes) - more efficient than VARCHAR(26)
      id BYTEA PRIMARY KEY,

      -- File metadata
      name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      size_bytes BIGINT NOT NULL,

      -- Binary file content
      content BYTEA,

      -- Checksum for integrity
      sha256_hash BYTEA,

      -- Timestamps
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create index on ULID for fast lookups
  await db.execute(sql`CREATE INDEX idx_files_created_at ON files(created_at)`);

  console.log('  → Created files table with binary ULID and BYTEA columns');
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS files`);
  console.log('  → Dropped files table');
}

export default { up, down };
