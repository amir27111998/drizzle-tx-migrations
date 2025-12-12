import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { Migrator } from '../../src/migrator';
import { MigrationGenerator } from '../../src/generator';

describe('PostgreSQL Integration Tests', () => {
  let masterPool: Pool;
  let pool: Pool;
  let db: any;
  let testDir: string;
  let migrator: Migrator;
  let generator: MigrationGenerator;
  let testDatabase: string;

  beforeAll(async () => {
    // Connect to postgres database for creating test databases
    masterPool = new Pool({
      host: 'localhost',
      port: 54320,
      user: 'testuser',
      password: 'testpass',
      database: 'postgres', // Connect to default postgres database
    });
  });

  afterAll(async () => {
    await masterPool.end();
  });

  beforeEach(async () => {
    // Create unique database and directory for this test
    const testId = Math.random().toString(36).substring(7);
    testDatabase = `test_db_${testId}`;
    testDir = path.join(__dirname, `../test-migrations-pg-${testId}`);

    // Create fresh database for complete isolation
    await masterPool.query(`CREATE DATABASE ${testDatabase}`);

    // Create new pool for the test database
    pool = new Pool({
      host: 'localhost',
      port: 54320,
      user: 'testuser',
      password: 'testpass',
      database: testDatabase,
    });

    db = drizzle(pool);
    fs.mkdirSync(testDir, { recursive: true });

    migrator = new Migrator({
      db,
      dialect: 'postgresql',
      config: { migrationsFolder: testDir },
    });

    generator = new MigrationGenerator(testDir);

    // Initialize migration table
    await migrator.initialize();
  });

  afterEach(async () => {
    // Close the pool for this test database
    await pool.end();

    // Drop the entire database (removes all tables and data)
    try {
      await masterPool.query(`DROP DATABASE IF EXISTS ${testDatabase}`);
    } catch (e) {
      // Ignore cleanup errors
    }

    // Remove test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should run a simple migration', async () => {
    // Create migration file
    const migrationPath = path.join(testDir, '1000_create_users.ts');
    fs.writeFileSync(
      migrationPath,
      `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL
    )
  \`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS users\`);
}

export default { up, down };
      `
    );

    // Verify file exists
    expect(fs.existsSync(migrationPath)).toBe(true);

    // Run migration
    const result = await migrator.runMigrations();

    expect(result.success).toBe(true);
    expect(result.executed.length).toBe(1);

    // Verify table was created
    const tableCheck = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'users'`
    );
    expect(tableCheck.rows.length).toBe(1);

    // Verify migration was tracked
    const status = await migrator.getStatus();
    expect(status.executed.length).toBe(1);
    expect(status.pending.length).toBe(0);
  });

  test('should rollback migration on error', async () => {
    // Create migration with error
    const migrationPath = path.join(testDir, '1000_failing_migration.ts');
    fs.writeFileSync(
      migrationPath,
      `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id SERIAL PRIMARY KEY)\`);
  await db.execute(sql\`INVALID SQL THAT WILL FAIL\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS users\`);
}

export default { up, down };
      `
    );

    // Run migration (should fail and return success: false)
    const result = await migrator.runMigrations();
    expect(result.success).toBe(false);
    expect(result.executed.length).toBe(0);

    // Verify table was NOT created (transaction rolled back)
    const tableCheck = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'users'`
    );
    expect(tableCheck.rows.length).toBe(0);

    // Verify migration was NOT tracked
    const status = await migrator.getStatus();
    expect(status.executed.length).toBe(0);
  });

  test('should run multiple migrations in order', async () => {
    // Ensure clean state
    try {
      await pool.query('DROP TABLE IF EXISTS posts CASCADE');
      await pool.query('DROP TABLE IF EXISTS users CASCADE');
      await pool.query('DELETE FROM drizzle_migrations');
    } catch (e) {
      // Ignore
    }

    // Create first migration
    fs.writeFileSync(
      path.join(testDir, '1000_create_users.ts'),
      `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(255))\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS users\`);
}

export default { up, down };
      `
    );

    // Create second migration
    fs.writeFileSync(
      path.join(testDir, '2000_create_posts.ts'),
      `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      title VARCHAR(255)
    )
  \`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS posts\`);
}

export default { up, down };
      `
    );

    // Run all migrations
    const result = await migrator.runMigrations();

    expect(result.success).toBe(true);
    expect(result.executed.length).toBe(2);

    // Verify both tables exist
    const usersCheck = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'users'`
    );
    const postsCheck = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'posts'`
    );

    expect(usersCheck.rows.length).toBe(1);
    expect(postsCheck.rows.length).toBe(1);
  });

  test('should revert last migration', async () => {
    // Ensure clean state
    try {
      await pool.query('DROP TABLE IF EXISTS users CASCADE');
      await pool.query('DELETE FROM drizzle_migrations');
    } catch (e) {
      // Ignore
    }

    // Create and run migration
    fs.writeFileSync(
      path.join(testDir, '1000_create_users.ts'),
      `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id SERIAL PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS users\`);
}

export default { up, down };
      `
    );

    await migrator.runMigrations();

    // Verify table exists
    let tableCheck = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'users'`
    );
    expect(tableCheck.rows.length).toBe(1);

    // Revert migration
    const result = await migrator.revertMigration();

    expect(result.success).toBe(true);
    expect(result.reverted.length).toBe(1);

    // Verify table was dropped
    tableCheck = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'users'`
    );
    expect(tableCheck.rows.length).toBe(0);

    // Verify migration tracking was removed
    const status = await migrator.getStatus();
    expect(status.executed.length).toBe(0);
  });

  test('should revert to specific migration', async () => {
    // Ensure clean state
    try {
      await pool.query('DROP TABLE IF EXISTS table_three CASCADE');
      await pool.query('DROP TABLE IF EXISTS table_two CASCADE');
      await pool.query('DROP TABLE IF EXISTS table_one CASCADE');
      await pool.query('DELETE FROM drizzle_migrations');
    } catch (e) {
      // Ignore
    }

    // Create three migrations
    fs.writeFileSync(
      path.join(testDir, '1000_migration_one.ts'),
      `
import { type MigrationContext } from '../../src/types';
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE table_one (id SERIAL PRIMARY KEY)\`);
}
export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS table_one\`);
}
export default { up, down };
      `
    );

    fs.writeFileSync(
      path.join(testDir, '2000_migration_two.ts'),
      `
import { type MigrationContext } from '../../src/types';
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE table_two (id SERIAL PRIMARY KEY)\`);
}
export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS table_two\`);
}
export default { up, down };
      `
    );

    fs.writeFileSync(
      path.join(testDir, '3000_migration_three.ts'),
      `
import { type MigrationContext } from '../../src/types';
export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE table_three (id SERIAL PRIMARY KEY)\`);
}
export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS table_three\`);
}
export default { up, down };
      `
    );

    // Run all migrations
    await migrator.runMigrations();

    // Revert to first migration (should revert 2 and 3)
    const result = await migrator.revertTo('1000_migration_one');

    expect(result.success).toBe(true);
    expect(result.reverted.length).toBe(2);

    // Verify only table_one exists
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name LIKE 'table_%'`
    );

    expect(tables.rows.length).toBe(1);
    expect(tables.rows[0].table_name).toBe('table_one');
  });
});
