import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Migrator, MigrationGenerator } from 'drizzle-tx-migrations';

/**
 * Example: Programmatic usage of drizzle-tx-migrations
 *
 * This shows how to use the migration system programmatically
 * in your application code, rather than through the CLI.
 */

async function runMigrations() {
  // Create database connection
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'mydb',
  });

  const db = drizzle(pool);

  // Create migrator instance
  const migrator = new Migrator({
    db,
    dialect: 'postgresql',
    config: {
      migrationsFolder: './migrations',
      migrationsTable: '__drizzle_migrations',
    },
  });

  try {
    // Run all pending migrations
    console.log('Running migrations...');
    const result = await migrator.runMigrations();

    if (result.success) {
      console.log('Migrations completed successfully!');
      console.log('Executed:', result.executed);
    } else {
      console.error('Migration failed!');
    }

    // Check status
    const status = await migrator.getStatus();
    console.log('Executed migrations:', status.executed.length);
    console.log('Pending migrations:', status.pending.length);
  } catch (error) {
    console.error('Error running migrations:', error);
  } finally {
    await pool.end();
  }
}

async function generateMigration() {
  const generator = new MigrationGenerator('./migrations');

  // Generate a new migration file
  const filePath = generator.generateMigration('add_posts_table');
  console.log('Migration created:', filePath);

  // List all migrations
  const migrations = generator.listMigrations();
  console.log('All migrations:', migrations);
}

async function revertMigrations() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'mydb',
  });

  const db = drizzle(pool);

  const migrator = new Migrator({
    db,
    dialect: 'postgresql',
    config: {
      migrationsFolder: './migrations',
    },
  });

  try {
    // Revert last migration
    console.log('Reverting last migration...');
    const result = await migrator.revertMigration(1);

    if (result.success) {
      console.log('Revert completed successfully!');
      console.log('Reverted:', result.reverted);
    }

    // Revert to specific migration
    // await migrator.revertTo('1234567890_create_users_table');
  } catch (error) {
    console.error('Error reverting migrations:', error);
  } finally {
    await pool.end();
  }
}

// Run examples
if (require.main === module) {
  const command = process.argv[2];

  switch (command) {
    case 'run':
      runMigrations();
      break;
    case 'generate':
      generateMigration();
      break;
    case 'revert':
      revertMigrations();
      break;
    default:
      console.log('Usage: node programmatic-usage.ts [run|generate|revert]');
  }
}
