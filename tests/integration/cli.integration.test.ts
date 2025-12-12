import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const execAsync = promisify(exec);

describe('CLI Integration Tests', () => {
  let pool: Pool;
  let testDir: string;
  let configPath: string;
  let cliPath: string;

  beforeAll(async () => {
    // Connect to test database
    pool = new Pool({
      host: 'localhost',
      port: 54320,
      user: 'testuser',
      password: 'testpass',
      database: 'test_migrations',
    });

    // Get absolute path to CLI
    cliPath = path.join(__dirname, '../../dist/cli.js');

    // Create unique test directory
    const testId = Math.random().toString(36).substring(7);
    testDir = path.join(__dirname, `../test-migrations-cli-${testId}`);
    fs.mkdirSync(testDir, { recursive: true });

    // Create config file
    configPath = path.join(testDir, 'drizzle-migrations.config.ts');
    fs.writeFileSync(
      configPath,
      `
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Migrator, MigrationGenerator } from '../../../src/index';

const pool = new Pool({
  host: 'localhost',
  port: 54320,
  user: 'testuser',
  password: 'testpass',
  database: 'test_migrations',
});

const db = drizzle(pool);

export const migrator = new Migrator({
  db,
  dialect: 'postgresql',
  config: { migrationsFolder: './migrations' },
});

export const generator = new MigrationGenerator('./migrations');
export default { migrator, generator };
      `
    );
  });

  afterAll(async () => {
    // Cleanup
    try {
      await pool.query('DROP TABLE IF EXISTS __drizzle_migrations CASCADE');
      await pool.query('DROP TABLE IF EXISTS test_table CASCADE');
      await pool.end();
    } catch (e) {
      // Ignore
    }

    // Remove test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    // Clean between tests
    try {
      await pool.query('DELETE FROM __drizzle_migrations');
      await pool.query('DROP TABLE IF EXISTS test_table CASCADE');
    } catch (e) {
      // Ignore
    }

    // Remove generated migrations
    const migrationsDir = path.join(testDir, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir);
      files.forEach((file) => {
        fs.unlinkSync(path.join(migrationsDir, file));
      });
    }
  });

  test('should generate migration via CLI', async () => {
    const { stdout } = await execAsync(`cd ${testDir} && node ${cliPath} generate test_migration`);

    expect(stdout).toContain('Migration created');

    // Verify file was created
    const migrationsDir = path.join(testDir, 'migrations');
    const files = fs.readdirSync(migrationsDir);

    expect(files.length).toBe(1);
    expect(files[0]).toContain('test_migration');
  });

  test('should show status via CLI', async () => {
    // Create a migration first
    await execAsync(`cd ${testDir} && node ${cliPath} generate test_migration`);

    const { stdout } = await execAsync(`cd ${testDir} && node ${cliPath} status`);

    expect(stdout).toContain('Migration Status');
    expect(stdout).toContain('Pending migrations');
  });

  test('should run migrations via CLI', async () => {
    // Create migration
    await execAsync(`cd ${testDir} && node ${cliPath} generate create_test_table`);

    // Edit migration to add actual SQL
    const migrationsDir = path.join(testDir, 'migrations');
    const files = fs.readdirSync(migrationsDir);
    const migrationFile = path.join(migrationsDir, files[0]);

    fs.writeFileSync(
      migrationFile,
      `
import { type MigrationContext } from '../../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE test_table (id SERIAL PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS test_table\`);
}

export default { up, down };
      `
    );

    // Run migration
    const { stdout } = await execAsync(`cd ${testDir} && node ${cliPath} up`);

    expect(stdout).toContain('executed successfully');

    // Verify table was created
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'test_table'`
    );
    expect(result.rows.length).toBe(1);
  });

  test('should validate migrations via CLI', async () => {
    // Create valid migration
    await execAsync(`cd ${testDir} && node ${cliPath} generate valid_migration`);

    const { stdout } = await execAsync(`cd ${testDir} && node ${cliPath} validate`);

    expect(stdout).toContain('valid');
  });

  test('check command should exit with code 1 when pending migrations exist', async () => {
    // Create migration
    await execAsync(`cd ${testDir} && node ${cliPath} generate pending_test`);

    // Check command should fail
    try {
      await execAsync(`cd ${testDir} && node ${cliPath} check`);
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.code).toBe(1);
      expect(error.stdout).toContain('pending migration');
    }
  });

  test('check command should exit with code 0 when no pending migrations', async () => {
    // Don't create any migrations or run them all first
    const { stdout, stderr } = await execAsync(`cd ${testDir} && node ${cliPath} check`);

    expect(stdout).toContain('up to date');
  });

  test('should rollback migration via CLI', async () => {
    // Create and run migration
    await execAsync(`cd ${testDir} && node ${cliPath} generate test_rollback`);

    const migrationsDir = path.join(testDir, 'migrations');
    const files = fs.readdirSync(migrationsDir);
    const migrationFile = path.join(migrationsDir, files[0]);

    fs.writeFileSync(
      migrationFile,
      `
import { type MigrationContext } from '../../../src/types';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE test_table (id SERIAL PRIMARY KEY)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS test_table\`);
}

export default { up, down };
      `
    );

    await execAsync(`cd ${testDir} && node ${cliPath} up`);

    // Rollback
    const { stdout } = await execAsync(`cd ${testDir} && node ${cliPath} down`);

    expect(stdout.includes('reverted') || stdout.includes('Rolled back')).toBe(true);

    // Verify table was dropped
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'test_table'`
    );
    expect(result.rows.length).toBe(0);
  });
});
