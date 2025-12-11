const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { MigrationGenerator } = require('../dist/generator');
const { setupTestEnvironment, cleanupTestEnvironment } = require('./setup');

describe('MigrationGenerator', () => {
  let testDir;

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

    assert.ok(fs.existsSync(filePath), 'Migration file should exist');
    assert.ok(filePath.includes('create_users_table'), 'File name should include migration name');

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('export async function up'), 'Should have up function');
    assert.ok(content.includes('export async function down'), 'Should have down function');
    assert.ok(content.includes('MigrationContext'), 'Should reference MigrationContext');
  });

  test('should sanitize migration names', () => {
    const generator = new MigrationGenerator(testDir);
    const filePath = generator.generateMigration('Create Users Table!!!');

    const fileName = path.basename(filePath);
    assert.ok(fileName.includes('create_users_table'), 'Should sanitize to snake_case');
    assert.ok(!fileName.includes('!'), 'Should remove special characters');
  });

  test('should list migration files', () => {
    const generator = new MigrationGenerator(testDir);

    // Generate multiple migrations
    generator.generateMigration('migration_one');
    generator.generateMigration('migration_two');
    generator.generateMigration('migration_three');

    const migrations = generator.listMigrations();
    assert.strictEqual(migrations.length, 3, 'Should list 3 migrations');
    assert.ok(migrations[0].includes('migration_one'), 'Should include first migration');
  });

  test('should return empty array when no migrations exist', () => {
    const generator = new MigrationGenerator(testDir);
    const migrations = generator.listMigrations();
    assert.strictEqual(migrations.length, 0, 'Should return empty array');
  });
});
