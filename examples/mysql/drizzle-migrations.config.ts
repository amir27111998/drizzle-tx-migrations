import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { Migrator, MigrationGenerator } from 'drizzle-tx-migrations';

// Create database connection
const poolConnection = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'mydb',
});

const db = drizzle(poolConnection);

// Create migrator instance
export const migrator = new Migrator({
  db,
  dialect: 'mysql',
  config: {
    migrationsFolder: './migrations',
    migrationsTable: '__drizzle_migrations',
  },
});

// Create generator instance
export const generator = new MigrationGenerator('./migrations');

export default { migrator, generator };
