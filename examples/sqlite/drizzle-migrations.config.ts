import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { Migrator, MigrationGenerator } from 'drizzle-tx-migrations';

// Create database connection
const sqlite = new Database(process.env.DB_PATH || './db.sqlite');
const db = drizzle(sqlite);

// Create migrator instance
export const migrator = new Migrator({
  db,
  dialect: 'sqlite',
  config: {
    migrationsFolder: './migrations',
    migrationsTable: '__drizzle_migrations',
  },
});

// Create generator instance
// For basic usage (blank migrations):
// export const generator = new MigrationGenerator('./migrations');

// For auto-generation from schema diff:
// SQLite uses table recreation pattern for schema changes (add/drop columns, modify constraints)
export const generator = new MigrationGenerator(
  './migrations',
  db, // Pass the database instance for introspection
  'sqlite', // Specify the dialect
  ['./src/schema.ts'] // Path(s) to your Drizzle schema files
);

export default { migrator, generator };
