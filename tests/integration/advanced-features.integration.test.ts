import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';
import { Migrator } from '../../src/migrator';
import { MigrationGenerator } from '../../src/generator';

describe('Advanced Features Integration Tests', () => {
  let masterPool: mysql.Pool;
  let pool: mysql.Pool;
  let db: any;
  let testDir: string;
  let migrator: Migrator;
  let generator: MigrationGenerator;
  let testDatabase: string;

  beforeAll(async () => {
    masterPool = mysql.createPool({
      host: 'localhost',
      port: 33060,
      user: 'root',
      password: 'rootpass',
    });
  });

  afterAll(async () => {
    await masterPool.end();
  });

  beforeEach(async () => {
    const testId = Math.random().toString(36).substring(7);
    testDatabase = `test_advanced_${testId}`;
    testDir = path.join(__dirname, `../test-advanced-${testId}`);

    await masterPool.query(`CREATE DATABASE ${testDatabase}`);

    pool = mysql.createPool({
      host: 'localhost',
      port: 33060,
      user: 'root',
      password: 'rootpass',
      database: testDatabase,
    });

    db = drizzle(pool);
    fs.mkdirSync(testDir, { recursive: true });

    migrator = new Migrator({
      db,
      dialect: 'mysql',
      config: { migrationsFolder: testDir },
    });

    generator = new MigrationGenerator(testDir);
    await migrator.initialize();
  });

  afterEach(async () => {
    await pool.end();
    try {
      await masterPool.query(`DROP DATABASE IF EXISTS ${testDatabase}`);
    } catch (e) {
      // Ignore cleanup errors
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Fake Migrations', () => {
    test('should mark migration as run without executing (fake up)', async () => {
      // Create migration
      fs.writeFileSync(
        path.join(testDir, '1000_create_users.ts'),
        `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id INT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE users\`);
}

export default { up, down };
        `
      );

      // Run with fake flag
      const result = await migrator.runMigrations({ fake: true });

      expect(result.success).toBe(true);
      expect(result.executed.length).toBe(1);

      // Verify table was NOT created
      const [rows] = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = '${testDatabase}' AND table_name = 'users'`
      );
      expect((rows as any[]).length).toBe(0);

      // Verify migration IS tracked
      const status = await migrator.getStatus();
      expect(status.executed.length).toBe(1);
      expect(status.pending.length).toBe(0);
    });

    test('should remove migration from tracking without running down (fake revert)', async () => {
      // Create and actually run migration
      fs.writeFileSync(
        path.join(testDir, '1000_create_users.ts'),
        `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id INT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE users\`);
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

      // Fake revert
      const result = await migrator.revertMigration(1, { fake: true });

      expect(result.success).toBe(true);
      expect(result.reverted.length).toBe(1);

      // Verify table STILL exists (down was not run)
      [rows] = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = '${testDatabase}' AND table_name = 'users'`
      );
      expect((rows as any[]).length).toBe(1);

      // Verify migration is NOT tracked anymore
      const status = await migrator.getStatus();
      expect(status.executed.length).toBe(0);
      expect(status.pending.length).toBe(1);
    });

    test('should allow re-running migration after fake revert', async () => {
      fs.writeFileSync(
        path.join(testDir, '1000_create_users.ts'),
        `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS users\`);
}

export default { up, down };
        `
      );

      // Fake run
      await migrator.runMigrations({ fake: true });

      // Fake revert
      await migrator.revertMigration(1, { fake: true });

      // Actually run
      const result = await migrator.runMigrations();

      expect(result.success).toBe(true);
      expect(result.executed.length).toBe(1);

      // Table should now exist
      const [rows] = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = '${testDatabase}' AND table_name = 'users'`
      );
      expect((rows as any[]).length).toBe(1);
    });
  });

  describe('Dry Run Mode', () => {
    test('should preview migrations without executing (dry run up)', async () => {
      fs.writeFileSync(
        path.join(testDir, '1000_create_users.ts'),
        `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id INT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE users\`);
}

export default { up, down };
        `
      );

      const result = await migrator.runMigrations({ dryRun: true });

      expect(result.success).toBe(true);
      // Dry run returns empty array since nothing was actually executed
      expect(result.executed.length).toBe(0);

      // Verify table was NOT created
      const [rows] = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = '${testDatabase}' AND table_name = 'users'`
      );
      expect((rows as any[]).length).toBe(0);

      // Verify migration was NOT tracked
      const status = await migrator.getStatus();
      expect(status.executed.length).toBe(0);
      expect(status.pending.length).toBe(1);
    });

    test('should preview revert without executing (dry run down)', async () => {
      // Create and run migration
      fs.writeFileSync(
        path.join(testDir, '1000_create_users.ts'),
        `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id INT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE users\`);
}

export default { up, down };
        `
      );

      await migrator.runMigrations();

      // Dry run revert
      const result = await migrator.revertMigration(1, { dryRun: true });

      expect(result.success).toBe(true);
      // Dry run returns empty array since nothing was actually reverted
      expect(result.reverted.length).toBe(0);

      // Verify table STILL exists
      const [rows] = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = '${testDatabase}' AND table_name = 'users'`
      );
      expect((rows as any[]).length).toBe(1);

      // Verify migration is STILL tracked
      const status = await migrator.getStatus();
      expect(status.executed.length).toBe(1);
    });
  });

  describe('Transaction Modes', () => {
    test('should run each migration in separate transaction (mode: each)', async () => {
      // Create two migrations
      fs.writeFileSync(
        path.join(testDir, '1000_create_users.ts'),
        `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id INT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE users\`);
}

export default { up, down };
        `
      );

      fs.writeFileSync(
        path.join(testDir, '2000_create_posts.ts'),
        `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE posts (id INT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE posts\`);
}

export default { up, down };
        `
      );

      const result = await migrator.runMigrations({ transactionMode: 'each' });

      expect(result.success).toBe(true);
      expect(result.executed.length).toBe(2);

      // Both tables should exist
      const [rows] = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = '${testDatabase}' AND table_name IN ('users', 'posts')`
      );
      expect((rows as any[]).length).toBe(2);
    });

    test('should run without transactions (mode: none)', async () => {
      fs.writeFileSync(
        path.join(testDir, '1000_create_users.ts'),
        `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id INT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE users\`);
}

export default { up, down };
        `
      );

      const result = await migrator.runMigrations({ transactionMode: 'none' });

      expect(result.success).toBe(true);
      expect(result.executed.length).toBe(1);
    });

    test('should respect per-migration transaction override', async () => {
      // Create migration with transaction: false
      fs.writeFileSync(
        path.join(testDir, '1000_no_transaction.ts'),
        `
import { type MigrationContext } from '../../src/types';

export const transaction = false;

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE no_tx_table (id INT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE no_tx_table\`);
}

export default { up, down, transaction };
        `
      );

      const result = await migrator.runMigrations({ transactionMode: 'each' });

      expect(result.success).toBe(true);
      expect(result.executed.length).toBe(1);

      // Table should exist
      const [rows] = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = '${testDatabase}' AND table_name = 'no_tx_table'`
      );
      expect((rows as any[]).length).toBe(1);
    });
  });

  describe('Revert To Specific Migration', () => {
    test('should revert to specific migration', async () => {
      // Create three migrations
      fs.writeFileSync(
        path.join(testDir, '1000_create_users.ts'),
        `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id INT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS users\`);
}

export default { up, down };
        `
      );

      fs.writeFileSync(
        path.join(testDir, '2000_create_posts.ts'),
        `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE posts (id INT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS posts\`);
}

export default { up, down };
        `
      );

      fs.writeFileSync(
        path.join(testDir, '3000_create_comments.ts'),
        `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE comments (id INT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS comments\`);
}

export default { up, down };
        `
      );

      // Run all migrations
      await migrator.runMigrations();

      let status = await migrator.getStatus();
      expect(status.executed.length).toBe(3);

      // Revert to first migration (should revert 3000 and 2000)
      const result = await migrator.revertTo('1000_create_users');

      expect(result.success).toBe(true);
      expect(result.reverted.length).toBe(2);

      // Only users table should exist
      const [rows] = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = '${testDatabase}' AND table_name IN ('users', 'posts', 'comments')`
      );
      expect((rows as any[]).length).toBe(1);
      // MySQL may return TABLE_NAME or table_name depending on driver
      const tableName = (rows as any[])[0].table_name || (rows as any[])[0].TABLE_NAME;
      expect(tableName).toBe('users');

      status = await migrator.getStatus();
      expect(status.executed.length).toBe(1);
      expect(status.pending.length).toBe(2);
    });

    test('should revert multiple migrations with count', async () => {
      // Create two migrations
      fs.writeFileSync(
        path.join(testDir, '1000_create_users.ts'),
        `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id INT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS users\`);
}

export default { up, down };
        `
      );

      fs.writeFileSync(
        path.join(testDir, '2000_create_posts.ts'),
        `
import { type MigrationContext } from '../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE posts (id INT PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS posts\`);
}

export default { up, down };
        `
      );

      await migrator.runMigrations();

      // Revert 2 migrations
      const result = await migrator.revertMigration(2);

      expect(result.success).toBe(true);
      expect(result.reverted.length).toBe(2);

      const status = await migrator.getStatus();
      expect(status.executed.length).toBe(0);
      expect(status.pending.length).toBe(2);
    });
  });

  describe('Generator Options', () => {
    test('should generate TypeScript migration by default', async () => {
      const filePath = await generator.generateMigration('test_migration');

      expect(filePath.endsWith('.ts')).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('MigrationContext');
      expect(content).toContain('Promise<void>');
    });

    test('should generate JavaScript migration when requested', async () => {
      const filePath = await generator.generateMigration('test_migration', {
        outputFormat: 'js',
      });

      expect(filePath.endsWith('.js')).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('module.exports');
      expect(content).not.toContain('MigrationContext');
    });
  });
});
