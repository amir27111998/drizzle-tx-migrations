/**
 * Tests for index.ts exports
 */

describe('Index exports', () => {
  test('should export Migrator', () => {
    const { Migrator } = require('../src/index');
    expect(Migrator).toBeDefined();
  });

  test('should export MigrationGenerator', () => {
    const { MigrationGenerator } = require('../src/index');
    expect(MigrationGenerator).toBeDefined();
  });

  test('should export MigrationTable', () => {
    const { MigrationTable } = require('../src/index');
    expect(MigrationTable).toBeDefined();
  });

  test('should export MigrationValidator', () => {
    const { MigrationValidator } = require('../src/index');
    expect(MigrationValidator).toBeDefined();
  });

  test('should export SchemaIntrospector', () => {
    const { SchemaIntrospector } = require('../src/index');
    expect(SchemaIntrospector).toBeDefined();
  });

  test('should export SchemaLoader', () => {
    const { SchemaLoader } = require('../src/index');
    expect(SchemaLoader).toBeDefined();
  });

  test('should export SchemaDiffer', () => {
    const { SchemaDiffer } = require('../src/index');
    expect(SchemaDiffer).toBeDefined();
  });

  test('should export SqlGenerator', () => {
    const { SqlGenerator } = require('../src/index');
    expect(SqlGenerator).toBeDefined();
  });
});
