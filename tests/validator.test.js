const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { MigrationValidator } = require('../dist/validator');
const { MigrationGenerator } = require('../dist/generator');
const { setupTestEnvironment, cleanupTestEnvironment } = require('./setup');

describe('MigrationValidator', () => {
  let testDir;

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

    assert.strictEqual(result.valid, true, 'Validation should pass');
    assert.strictEqual(result.errors.length, 0, 'Should have no errors');
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
    assert.ok(
      result.valid === false || result.errors.length > 0,
      'Validation should fail or have errors'
    );
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

    assert.strictEqual(result.valid, false, 'Validation should fail');
    assert.ok(
      result.errors.some((e) => e.includes('down()')),
      'Should detect missing down function'
    );
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

    assert.strictEqual(result.valid, false, 'Validation should fail');
    assert.ok(
      result.errors.some((e) => e.includes('Duplicate timestamp')),
      'Should detect duplicate timestamps'
    );
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
    assert.ok(result.warnings.length > 0, 'Should have warnings');
    assert.ok(
      result.warnings.some((w) => w.includes('MigrationContext')),
      'Should warn about missing parameters'
    );
  });

  test('should handle non-existent migrations folder', async () => {
    const validator = new MigrationValidator(path.join(testDir, 'non-existent'));
    const result = await validator.validate();

    assert.strictEqual(result.valid, true, 'Should handle gracefully');
    assert.ok(
      result.warnings.some((w) => w.includes('does not exist')),
      'Should warn about missing folder'
    );
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

    assert.ok(result.warnings.length > 0, 'Should have warnings');
    assert.ok(
      result.warnings.some((w) => w.includes('2000_second')),
      'Should detect out-of-order migration'
    );
  });
});
