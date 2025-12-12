import * as fs from 'fs';
import * as path from 'path';
import { MigrationValidator } from '../src/validator';
import { setupTestEnvironment, cleanupTestEnvironment } from './setup';

describe('MigrationValidator', () => {
  let testDir: string;

  beforeEach(() => {
    const setup = setupTestEnvironment();
    testDir = setup.testDir;
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  test('should validate correct migration files', async () => {
    // Create a properly formatted migration file manually
    const migrationPath = path.join(testDir, '1000_test_migration.ts');
    fs.writeFileSync(
      migrationPath,
      `
      export async function up({ db, sql }) {
        await db.execute(sql\`CREATE TABLE test (id INTEGER)\`);
      }

      export async function down({ db, sql }) {
        await db.execute(sql\`DROP TABLE test\`);
      }

      export default { up, down };
      `
    );

    const validator = new MigrationValidator(testDir);
    const result = await validator.validate();

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should detect missing up function', async () => {
    // Create invalid migration
    const filePath = path.join(testDir, '1234567890_invalid.ts');
    fs.writeFileSync(
      filePath,
      `
      export async function down({ db, sql }) {
        await db.execute(sql\`DROP TABLE users\`);
      }
      export default { down };
      `
    );

    const validator = new MigrationValidator(testDir);
    const result = await validator.validate();

    // Should either fail validation or have errors about missing up function
    expect(result.valid === false || result.errors.length > 0).toBe(true);
  });

  test('should detect missing down function', async () => {
    // Create invalid migration
    const filePath = path.join(testDir, '1234567890_invalid.ts');
    fs.writeFileSync(
      filePath,
      `
      export async function up({ db, sql }) {
        await db.execute(sql\`CREATE TABLE users (id INT)\`);
      }
      export default { up };
      `
    );

    const validator = new MigrationValidator(testDir);
    const result = await validator.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('down()'))).toBe(true);
  });

  test('should detect duplicate timestamps', async () => {
    const timestamp = '1234567890';

    fs.writeFileSync(
      path.join(testDir, `${timestamp}_migration_one.ts`),
      `
      export async function up({ db }) {}
      export async function down({ db }) {}
      export default { up, down };
      `
    );

    fs.writeFileSync(
      path.join(testDir, `${timestamp}_migration_two.ts`),
      `
      export async function up({ db }) {}
      export async function down({ db }) {}
      export default { up, down };
      `
    );

    const validator = new MigrationValidator(testDir);
    const result = await validator.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('Duplicate timestamp'))).toBe(true);
  });

  test('should warn about missing parameters', async () => {
    const filePath = path.join(testDir, '1234567890_test.ts');
    fs.writeFileSync(
      filePath,
      `
      export async function up() {
        // No parameters used
      }
      export async function down() {
        // No parameters used
      }
      export default { up, down };
      `
    );

    const validator = new MigrationValidator(testDir);
    const result = await validator.validate();

    // Should pass but with warnings
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w: string) => w.includes('MigrationContext'))).toBe(true);
  });

  test('should handle non-existent migrations folder', async () => {
    const validator = new MigrationValidator(path.join(testDir, 'non-existent'));
    const result = await validator.validate();

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w: string) => w.includes('does not exist'))).toBe(true);
  });

  test('should detect migration conflicts', () => {
    const validator = new MigrationValidator(testDir);

    // Create migrations
    fs.writeFileSync(path.join(testDir, '1000_first.ts'), 'export default {}');
    fs.writeFileSync(path.join(testDir, '2000_second.ts'), 'export default {}');
    fs.writeFileSync(path.join(testDir, '3000_third.ts'), 'export default {}');

    // Simulate executed migrations (skipping the middle one)
    const executedMigrations = ['1000_first', '3000_third'];

    const result = validator.checkForConflicts(executedMigrations);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w: string) => w.includes('2000_second'))).toBe(true);
  });
});
