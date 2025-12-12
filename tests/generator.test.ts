import * as fs from 'fs';
import * as path from 'path';
import { MigrationGenerator } from '../src/generator';
import { setupTestEnvironment, cleanupTestEnvironment } from './setup';

describe('MigrationGenerator', () => {
  let testDir: string;

  beforeEach(() => {
    const setup = setupTestEnvironment();
    testDir = setup.testDir;
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  test('should generate a migration file', () => {
    const generator = new MigrationGenerator(testDir);
    const filePath = generator.generateMigration('create_users_table');

    expect(fs.existsSync(filePath)).toBe(true);
    expect(filePath).toContain('create_users_table');

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('export async function up');
    expect(content).toContain('export async function down');
    expect(content).toContain('MigrationContext');
  });

  test('should sanitize migration names', () => {
    const generator = new MigrationGenerator(testDir);
    const filePath = generator.generateMigration('Create Users Table!!!');

    const fileName = path.basename(filePath);
    expect(fileName).toContain('create_users_table');
    expect(fileName).not.toContain('!');
  });

  test('should list migration files', () => {
    const generator = new MigrationGenerator(testDir);

    // Generate multiple migrations
    generator.generateMigration('migration_one');
    generator.generateMigration('migration_two');
    generator.generateMigration('migration_three');

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
