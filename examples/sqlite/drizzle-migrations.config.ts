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
export const generator = new MigrationGenerator('./migrations');

export default { migrator, generator };
