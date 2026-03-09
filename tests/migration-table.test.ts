/**
 * Tests for migration-table.ts
 */

import { MigrationTable } from '../src/migration-table';

// Helper to extract SQL string from drizzle sql.raw object
const getSqlString = (sqlObj: any): string => {
  if (typeof sqlObj === 'string') return sqlObj;
  // sql.raw() returns an object with queryChunks array
  // Each chunk has a 'value' property with the actual SQL strings
  if (sqlObj?.queryChunks) {
    return sqlObj.queryChunks
      .map((chunk: any) => {
        if (typeof chunk === 'string') return chunk;
        if (chunk?.value && Array.isArray(chunk.value)) return chunk.value.join('');
        if (typeof chunk?.value === 'string') return chunk.value;
        return String(chunk);
      })
      .join('');
  }
  // Fallback to toString
  return String(sqlObj);
};

describe('MigrationTable', () => {
  const createMockDb = () => ({
    execute: jest.fn().mockResolvedValue({ rows: [] }),
  });

  describe('constructor', () => {
    test('should use default table name', () => {
      const db = createMockDb();
      const table = new MigrationTable(db, 'postgresql');
      expect(table).toBeDefined();
    });

    test('should use custom table name', () => {
      const db = createMockDb();
      const table = new MigrationTable(db, 'mysql', 'custom_migrations');
      expect(table).toBeDefined();
    });
  });

  describe('ensureTable', () => {
    test('should create table for PostgreSQL', async () => {
      const db = createMockDb();
      const table = new MigrationTable(db, 'postgresql');

      await table.ensureTable();

      expect(db.execute).toHaveBeenCalledTimes(1);
      const sqlStr = getSqlString(db.execute.mock.calls[0][0]);
      expect(sqlStr).toContain('CREATE TABLE IF NOT EXISTS');
      expect(sqlStr).toContain('"__drizzle_migrations"');
      expect(sqlStr).toContain('SERIAL PRIMARY KEY');
    });

    test('should create table for MySQL', async () => {
      const db = createMockDb();
      const table = new MigrationTable(db, 'mysql');

      await table.ensureTable();

      expect(db.execute).toHaveBeenCalledTimes(1);
      const sqlStr = getSqlString(db.execute.mock.calls[0][0]);
      expect(sqlStr).toContain('CREATE TABLE IF NOT EXISTS');
      expect(sqlStr).toContain('`__drizzle_migrations`');
      expect(sqlStr).toContain('INT AUTO_INCREMENT PRIMARY KEY');
    });

    test('should create table for SQLite', async () => {
      const db = createMockDb();
      const table = new MigrationTable(db, 'sqlite');

      await table.ensureTable();

      expect(db.execute).toHaveBeenCalledTimes(1);
      const sqlStr = getSqlString(db.execute.mock.calls[0][0]);
      expect(sqlStr).toContain('CREATE TABLE IF NOT EXISTS');
      expect(sqlStr).toContain('"__drizzle_migrations"');
      expect(sqlStr).toContain('INTEGER PRIMARY KEY AUTOINCREMENT');
    });
  });

  describe('getExecutedMigrations', () => {
    test('should handle PostgreSQL result format', async () => {
      const db = createMockDb();
      db.execute.mockResolvedValue({
        rows: [
          { id: 1, name: 'migration_1', timestamp: 1000, executed_at: '2023-01-01' },
          { id: 2, name: 'migration_2', timestamp: 2000, executed_at: '2023-01-02' },
        ],
      });

      const table = new MigrationTable(db, 'postgresql');
      const migrations = await table.getExecutedMigrations();

      expect(migrations).toHaveLength(2);
      expect(migrations[0].name).toBe('migration_1');
      expect(migrations[0].timestamp).toBe(1000);
    });

    test('should handle MySQL result format', async () => {
      const db = createMockDb();
      db.execute.mockResolvedValue([
        [{ id: 1, name: 'migration_1', timestamp: 1000, executed_at: '2023-01-01' }],
        [], // metadata
      ]);

      const table = new MigrationTable(db, 'mysql');
      const migrations = await table.getExecutedMigrations();

      expect(migrations).toHaveLength(1);
      expect(migrations[0].name).toBe('migration_1');
    });

    test('should handle SQLite direct array result', async () => {
      const db = createMockDb();
      db.execute.mockResolvedValue([
        { id: 1, name: 'migration_1', timestamp: 1000, executed_at: null },
      ]);

      const table = new MigrationTable(db, 'sqlite');
      const migrations = await table.getExecutedMigrations();

      expect(migrations).toHaveLength(1);
      expect(migrations[0].name).toBe('migration_1');
      expect(migrations[0].executed_at).toBeUndefined();
    });
  });

  describe('addMigration', () => {
    test('should insert migration for PostgreSQL', async () => {
      const db = createMockDb();
      const table = new MigrationTable(db, 'postgresql');

      await table.addMigration('test_migration', 12345);

      expect(db.execute).toHaveBeenCalledTimes(1);
      const sqlStr = getSqlString(db.execute.mock.calls[0][0]);
      expect(sqlStr).toContain('INSERT INTO');
      expect(sqlStr).toContain('test_migration');
      expect(sqlStr).toContain('12345');
    });

    test('should insert migration for MySQL', async () => {
      const db = createMockDb();
      const table = new MigrationTable(db, 'mysql');

      await table.addMigration('test_migration', 12345);

      expect(db.execute).toHaveBeenCalledTimes(1);
      const sqlStr = getSqlString(db.execute.mock.calls[0][0]);
      expect(sqlStr).toContain('INSERT INTO');
      expect(sqlStr).toContain('`__drizzle_migrations`');
    });

    test('should insert migration for SQLite', async () => {
      const db = createMockDb();
      const table = new MigrationTable(db, 'sqlite');

      await table.addMigration('test_migration', 12345);

      expect(db.execute).toHaveBeenCalledTimes(1);
      const sqlStr = getSqlString(db.execute.mock.calls[0][0]);
      expect(sqlStr).toContain('INSERT INTO');
    });
  });

  describe('removeMigration', () => {
    test('should delete migration for PostgreSQL', async () => {
      const db = createMockDb();
      const table = new MigrationTable(db, 'postgresql');

      await table.removeMigration('test_migration');

      expect(db.execute).toHaveBeenCalledTimes(1);
      const sqlStr = getSqlString(db.execute.mock.calls[0][0]);
      expect(sqlStr).toContain('DELETE FROM');
      expect(sqlStr).toContain('test_migration');
    });

    test('should delete migration for MySQL', async () => {
      const db = createMockDb();
      const table = new MigrationTable(db, 'mysql');

      await table.removeMigration('test_migration');

      expect(db.execute).toHaveBeenCalledTimes(1);
      const sqlStr = getSqlString(db.execute.mock.calls[0][0]);
      expect(sqlStr).toContain('DELETE FROM');
      expect(sqlStr).toContain('`__drizzle_migrations`');
    });
  });
});
