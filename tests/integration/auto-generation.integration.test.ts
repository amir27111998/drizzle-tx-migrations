import * as fs from 'fs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { MigrationGenerator } from '../../src/generator';
import { Migrator } from '../../src/migrator';
import { SchemaIntrospector } from '../../src/schema-introspector';
import { SchemaDiffer } from '../../src/schema-differ';
import { SqlGenerator } from '../../src/sql-generator';
import { setupTestEnvironment, cleanupTestEnvironment } from '../setup';
import type { DatabaseSchema } from '../../src/schema-introspector';

describe('Auto-Generation Integration Tests', () => {
  let testDir: string;
  let testDb: string;
  let sqlite: Database.Database;
  let db: any;

  beforeEach(() => {
    const setup = setupTestEnvironment();
    testDir = setup.testDir;
    testDb = setup.testDb;

    sqlite = new Database(testDb);
    db = drizzle(sqlite);
  });

  afterEach(() => {
    sqlite?.close();
    cleanupTestEnvironment(testDir, testDb);
  });

  test('should introspect SQLite database schema', async () => {
    // Create a table
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        name TEXT
      )
    `);

    const introspector = new SchemaIntrospector(db, 'sqlite');
    const schema = await introspector.introspect();

    expect(schema.tables.size).toBe(1);
    expect(schema.tables.has('users')).toBe(true);

    const usersTable = schema.tables.get('users')!;
    expect(usersTable.columns).toHaveLength(3);
    expect(usersTable.columns.find((c) => c.name === 'email')?.notNull).toBe(true);
  });

  test('should introspect table with indexes', async () => {
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        name TEXT
      );
      CREATE UNIQUE INDEX idx_email ON users(email);
    `);

    const introspector = new SchemaIntrospector(db, 'sqlite');
    const schema = await introspector.introspect();

    const usersTable = schema.tables.get('users')!;
    expect(usersTable.indexes).toHaveLength(1);
    expect(usersTable.indexes[0].name).toBe('idx_email');
    expect(usersTable.indexes[0].unique).toBe(true);
  });

  test('should introspect table with foreign keys', async () => {
    sqlite.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL
      );

      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    const introspector = new SchemaIntrospector(db, 'sqlite');
    const schema = await introspector.introspect();

    const postsTable = schema.tables.get('posts')!;
    expect(postsTable.foreignKeys).toHaveLength(1);
    expect(postsTable.foreignKeys[0].column).toBe('user_id');
    expect(postsTable.foreignKeys[0].referencedTable).toBe('users');
    expect(postsTable.foreignKeys[0].onDelete).toBe('CASCADE');
  });

  test('should detect schema differences', async () => {
    // Current: empty database
    const currentSchema: DatabaseSchema = {tables: new Map()};

    // Desired: database with users table
    const desiredSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'text', notNull: true, primaryKey: false },
            ],
            indexes: [],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
      ]),
    };

    const differ = new SchemaDiffer(currentSchema, desiredSchema);
    const changes = differ.diff();

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('create_table');
    expect(changes[0].table).toBe('users');
  });

  test('should generate SQL from schema changes', () => {
    const desiredSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'text', notNull: true, primaryKey: false },
            ],
            indexes: [],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
      ]),
    };

    const currentSchema: DatabaseSchema = { tables: new Map() };
    const differ = new SchemaDiffer(currentSchema, desiredSchema);
    const changes = differ.diff();

    const sqlGenerator = new SqlGenerator('sqlite');
    const { upStatements, downStatements } = sqlGenerator.generate(changes);

    expect(upStatements).toHaveLength(1);
    expect(upStatements[0]).toContain('CREATE TABLE');
    expect(upStatements[0]).toContain('users');

    expect(downStatements).toHaveLength(1);
    expect(downStatements[0]).toContain('DROP TABLE');
  });

  test('should generate blank migration without schema config', async () => {
    const generator = new MigrationGenerator(testDir); // No schema files
    const migrationPath = await generator.generateMigration('blank_migration');

    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, 'utf-8');
    expect(content).toContain('// Write your migration logic here');
    expect(content).not.toContain('auto-generated from schema changes');
  });

  // Note: Migrator execution tests are skipped for SQLite in integration tests
  // because better-sqlite3 uses a different API (run/all) vs execute
  // Migrator functionality is thoroughly tested in unit tests with mocked DBs

  test('should handle full introspection to SQL generation flow', async () => {
    // Start with a table in the database
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL
      )
    `);

    // Introspect current state
    const introspector = new SchemaIntrospector(db, 'sqlite');
    const currentSchema = await introspector.introspect();

    // Define desired state (add a name column)
    const desiredSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'text', notNull: true, primaryKey: false },
              { name: 'name', type: 'text', notNull: false, primaryKey: false },
            ],
            indexes: [],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
      ]),
    };

    // Diff the schemas
    const differ = new SchemaDiffer(currentSchema, desiredSchema);
    const changes = differ.diff();

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('alter_table');

    // Generate SQL
    const sqlGenerator = new SqlGenerator('sqlite');
    const { upStatements, downStatements } = sqlGenerator.generate(changes);

    // Should have at least one ALTER TABLE statement
    expect(upStatements.length).toBeGreaterThanOrEqual(1);
    const alterStatement = upStatements.find((s) => s.includes('ALTER TABLE'));
    expect(alterStatement).toBeDefined();
    expect(alterStatement).toContain('ADD COLUMN');
    expect(alterStatement).toContain('name');
  });
});
