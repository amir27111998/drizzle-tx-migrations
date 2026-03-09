import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Migrator, MigrationGenerator } from 'drizzle-tx-migrations';

// Create database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'mydb',
});

const db = drizzle(pool);

// Create migrator instance
export const migrator = new Migrator({
  db,
  dialect: 'postgresql',
  config: {
    migrationsFolder: './migrations',
    migrationsTable: '__drizzle_migrations',
  },
});

// Create generator instance
// For basic usage (blank migrations):
// export const generator = new MigrationGenerator('./migrations');

// For auto-generation from schema diff:
export const generator = new MigrationGenerator(
  './migrations',
  db, // Pass the database instance for introspection
  'postgresql', // Specify the dialect
  ['./src/schema.ts'] // Path(s) to your Drizzle schema files
);

export default { migrator, generator };
