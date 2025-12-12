import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';
import { Migrator } from '../../src/migrator';
import { MigrationGenerator } from '../../src/generator';

describe('MySQL Integration Tests', () => {
  let masterPool: mysql.Pool;
  let pool: mysql.Pool;
  let db: any;
  let testDir: string;
  let migrator: Migrator;
  let generator: MigrationGenerator;
  let testDatabase: string;

  beforeAll(async () => {
    // Master pool for creating/dropping test databases
    // Use root user for database creation privileges
    masterPool = mysql.createPool({
      host: 'localhost',
      port: 33060, // Non-standard port from docker-compose.test.yml
      user: 'root',
      password: 'rootpass',
    });
  });

  afterAll(async () => {
    await masterPool.end();
  });

  beforeEach(async () => {
    // Create unique database and directory for this test
    const testId = Math.random().toString(36).substring(7);
    testDatabase = `test_db_${testId}`;
    testDir = path.join(__dirname, `../test-migrations-mysql-${testId}`);

    // Create fresh database for complete isolation
    await masterPool.query(`CREATE DATABASE ${testDatabase}`);

    // Create NEW pool specifically for this test database
    pool = mysql.createPool({
      host: 'localhost',
      port: 33060,
      user: 'root',
      password: 'rootpass',
      database: testDatabase, // Connect directly to the test database
    });

    db = drizzle(pool);
    fs.mkdirSync(testDir, { recursive: true });

    migrator = new Migrator({
      db,
      dialect: 'mysql',
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
      id INT AUTO_INCREMENT PRIMARY KEY,
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

    // Run migration
    const result = await migrator.runMigrations();

    expect(result.success).toBe(true);
    expect(result.executed.length).toBe(1);

    // Verify table was created
    const [rows] = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = '${testDatabase}' AND table_name = 'users'`
    );
    expect((rows as any[]).length).toBe(1);

    // Verify migration was tracked
    const status = await migrator.getStatus();
    expect(status.executed.length).toBe(1);
    expect(status.pending.length).toBe(0);
  });

  test('should rollback migration on error', async () => {
    // NOTE: MySQL DDL statements (CREATE TABLE, DROP TABLE, etc.) cause implicit commits
    // and cannot be rolled back. This test verifies that:
    // 1. The migration fails and returns success: false
    // 2. The migration is NOT tracked in the migrations table
    // 3. The table IS created (because DDL can't be rolled back in MySQL)

    // Create migration with error
    const migrationPath = path.join(testDir, '1000_failing_migration.ts');
    fs.writeFileSync(
      migrationPath,
      `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY)\`);
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

    // In MySQL, DDL cannot be rolled back, so table WILL exist
    const [rows] = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = '${testDatabase}' AND table_name = 'users'`
    );
    expect((rows as any[]).length).toBe(1); // Table exists (MySQL DDL limitation)

    // Verify migration was NOT tracked (this is the important part)
    const status = await migrator.getStatus();
    expect(status.executed.length).toBe(0);
  });

  test('should run multiple migrations in order', async () => {
    // Create first migration
    fs.writeFileSync(
      path.join(testDir, '1000_create_users.ts'),
      `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255))\`);
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
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      title VARCHAR(255),
      FOREIGN KEY (user_id) REFERENCES users(id)
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
    const [rows] = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = '${testDatabase}' AND table_name IN ('users', 'posts')`
    );

    expect((rows as any[]).length).toBe(2);
  });

  test('should revert last migration', async () => {
    // Create and run migration
    fs.writeFileSync(
      path.join(testDir, '1000_create_users.ts'),
      `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS users\`);
}

export default { up, down };
      `
    );

    await migrator.runMigrations();

    // Verify table exists
    let [rows] = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = '${testDatabase}' AND table_name = 'users'`
    );
    expect((rows as any[]).length).toBe(1);

    // Revert migration
    const result = await migrator.revertMigration();

    expect(result.success).toBe(true);
    expect(result.reverted.length).toBe(1);

    // Verify table was dropped
    [rows] = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = '${testDatabase}' AND table_name = 'users'`
    );
    expect((rows as any[]).length).toBe(0);

    // Verify migration tracking was removed
    const status = await migrator.getStatus();
    expect(status.executed.length).toBe(0);
  });
});
