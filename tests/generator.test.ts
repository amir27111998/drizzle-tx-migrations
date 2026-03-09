import * as fs from 'fs';
import * as path from 'path';
import { MigrationGenerator } from '../src/generator';
import { setupTestEnvironment, cleanupTestEnvironment } from './setup';

describe('MigrationGenerator', () => {
  let testDir: string;
  let testDb: string;

  beforeEach(() => {
    const setup = setupTestEnvironment();
    testDir = setup.testDir;
    testDb = setup.testDb;
  });

  afterEach(() => {
    cleanupTestEnvironment(testDir, testDb);
  });

  test('should generate a migration file', async () => {
    const generator = new MigrationGenerator(testDir);
    const filePath = await generator.generateMigration('create_users_table');

    expect(fs.existsSync(filePath)).toBe(true);
    expect(filePath).toContain('create_users_table');

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('export async function up');
    expect(content).toContain('export async function down');
    expect(content).toContain('MigrationContext');
  });

  test('should sanitize migration names', async () => {
    const generator = new MigrationGenerator(testDir);
    const filePath = await generator.generateMigration('Create Users Table!!!');

    const fileName = path.basename(filePath);
    expect(fileName).toContain('create_users_table');
    expect(fileName).not.toContain('!');
  });

  test('should list migration files', async () => {
    const generator = new MigrationGenerator(testDir);

    // Generate multiple migrations
    await generator.generateMigration('migration_one');
    await generator.generateMigration('migration_two');
    await generator.generateMigration('migration_three');

    const migrations = generator.listMigrations();
    expect(migrations).toHaveLength(3);
    expect(migrations[0]).toContain('migration_one');
  });

  test('should return empty array when no migrations exist', () => {
    const generator = new MigrationGenerator(testDir);
    const migrations = generator.listMigrations();
    expect(migrations).toHaveLength(0);
  });
});
