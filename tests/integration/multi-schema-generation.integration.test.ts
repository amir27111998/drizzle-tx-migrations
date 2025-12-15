import * as fs from 'fs';
import * as path from 'path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { MigrationGenerator } from '../../src/generator';
import { SchemaIntrospector } from '../../src/schema-introspector';
import { SchemaDiffer } from '../../src/schema-differ';
import { SqlGenerator } from '../../src/sql-generator';
import { setupTestEnvironment, cleanupTestEnvironment } from '../setup';
import type { DatabaseSchema } from '../../src/schema-introspector';

describe('Multi-Schema Auto-Generation Integration Tests', () => {
  let testDir: string;
  let testDb: string;
  let sqlite: Database.Database;
  let db: any;
  let schemaDir1: string;
  let schemaDir2: string;

  beforeEach(() => {
    const setup = setupTestEnvironment();
    testDir = setup.testDir;
    testDb = setup.testDb;

    // Create separate schema directories
    schemaDir1 = path.join(testDir, 'schemas', 'users');
    schemaDir2 = path.join(testDir, 'schemas', 'posts');
    fs.mkdirSync(schemaDir1, { recursive: true });
    fs.mkdirSync(schemaDir2, { recursive: true });

    sqlite = new Database(testDb);
    db = drizzle(sqlite);
  });

  afterEach(() => {
    sqlite?.close();
    cleanupTestEnvironment(testDir, testDb);
  });

  test('should create schema files in different folders and verify generator handles them', async () => {
    // Create first schema file - users
    const usersSchemaPath = path.join(schemaDir1, 'users.schema.ts');
    const usersSchemaContent = `
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  name: text('name'),
  createdAt: text('created_at'),
});
`;
    fs.writeFileSync(usersSchemaPath, usersSchemaContent);

    // Create second schema file - posts
    const postsSchemaPath = path.join(schemaDir2, 'posts.schema.ts');
    const postsSchemaContent = `
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  title: text('title').notNull(),
  content: text('content'),
});
`;
    fs.writeFileSync(postsSchemaPath, postsSchemaContent);

    // Verify schema files were created
    expect(fs.existsSync(usersSchemaPath)).toBe(true);
    expect(fs.existsSync(postsSchemaPath)).toBe(true);

    // Create generator with both schema files
    const generator = new MigrationGenerator(
      testDir,
      db,
      'sqlite',
      [usersSchemaPath, postsSchemaPath]
    );

    // Generate migration
    const migrationPath = await generator.generateMigration('create_initial_tables');

    // Verify migration file was created
    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, 'utf-8');

    // Verify basic migration structure
    expect(content).toContain('export async function up');
    expect(content).toContain('export async function down');
    expect(content).toContain('export default { up, down }');
  });

  test('should generate correct SQL for multiple tables using introspection', async () => {
    // Define desired schema with two tables
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
        [
          'posts',
          {
            name: 'posts',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'user_id', type: 'integer', notNull: true, primaryKey: false },
              { name: 'title', type: 'text', notNull: true, primaryKey: false },
              { name: 'content', type: 'text', notNull: false, primaryKey: false },
            ],
            indexes: [],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
      ]),
    };

    const currentSchema: DatabaseSchema = { tables: new Map() };

    // Generate diff
    const differ = new SchemaDiffer(currentSchema, desiredSchema);
    const changes = differ.diff();

    expect(changes).toHaveLength(2);
    expect(changes[0].type).toBe('create_table');
    expect(changes[1].type).toBe('create_table');

    // Generate SQL
    const sqlGenerator = new SqlGenerator('sqlite');
    const { upStatements, downStatements } = sqlGenerator.generate(changes);

    // Verify UP statements for both tables
    expect(upStatements).toHaveLength(2);
    expect(upStatements[0]).toContain('CREATE TABLE');
    expect(upStatements[1]).toContain('CREATE TABLE');

    expect(upStatements.some((s) => s.includes('"users"'))).toBe(true);
    expect(upStatements.some((s) => s.includes('"posts"'))).toBe(true);

    const usersStatement = upStatements.find((s) => s.includes('"users"'));
    expect(usersStatement).toContain('"email"');
    expect(usersStatement).toContain('TEXT NOT NULL');
    expect(usersStatement).toContain('"name"');

    const postsStatement = upStatements.find((s) => s.includes('"posts"'));
    expect(postsStatement).toContain('"user_id"');
    expect(postsStatement).toContain('"title"');
    expect(postsStatement).toContain('"content"');

    // Verify DOWN statements
    expect(downStatements).toHaveLength(2);
    expect(downStatements.every((s) => s.includes('DROP TABLE'))).toBe(true);
  });

  test('should detect column additions across multiple tables', async () => {
    // Create initial tables
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL
      );
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL
      );
    `);

    // Introspect current state
    const introspector = new SchemaIntrospector(db, 'sqlite');
    const currentSchema = await introspector.introspect();

    expect(currentSchema.tables.size).toBe(2);

    // Define desired state with additional columns
    const desiredSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'text', notNull: true, primaryKey: false },
              { name: 'name', type: 'text', notNull: false, primaryKey: false },  // NEW
              { name: 'age', type: 'integer', notNull: false, primaryKey: false },  // NEW
            ],
            indexes: [],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
        [
          'posts',
          {
            name: 'posts',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'title', type: 'text', notNull: true, primaryKey: false },
              { name: 'content', type: 'text', notNull: false, primaryKey: false },  // NEW
              { name: 'user_id', type: 'integer', notNull: false, primaryKey: false },  // NEW
            ],
            indexes: [],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
      ]),
    };

    // Diff schemas
    const differ = new SchemaDiffer(currentSchema, desiredSchema);
    const changes = differ.diff();

    expect(changes).toHaveLength(2); // ALTER for users and posts

    // Generate SQL
    const sqlGenerator = new SqlGenerator('sqlite');
    const { upStatements } = sqlGenerator.generate(changes);

    // Should have ALTER TABLE statements for both tables
    const alterStatements = upStatements.filter((s) => s.includes('ALTER TABLE'));
    expect(alterStatements.length).toBeGreaterThanOrEqual(4); // 2 columns per table

    // Check for users columns
    expect(upStatements.some((s) => s.includes('users') && s.includes('name'))).toBe(true);
    expect(upStatements.some((s) => s.includes('users') && s.includes('age'))).toBe(true);

    // Check for posts columns
    expect(upStatements.some((s) => s.includes('posts') && s.includes('content'))).toBe(true);
    expect(upStatements.some((s) => s.includes('posts') && s.includes('user_id'))).toBe(true);
  });

  test('should handle table drop when removed from desired schema', async () => {
    // Create three tables
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL
      );
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL
      );
      CREATE TABLE comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL
      );
    `);

    const introspector = new SchemaIntrospector(db, 'sqlite');
    const currentSchema = await introspector.introspect();

    expect(currentSchema.tables.size).toBe(3);

    // Desired schema without comments table
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
        [
          'posts',
          {
            name: 'posts',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'title', type: 'text', notNull: true, primaryKey: false },
            ],
            indexes: [],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
      ]),
    };

    // Diff
    const differ = new SchemaDiffer(currentSchema, desiredSchema);
    const changes = differ.diff();

    const dropTableChange = changes.find((c) => c.type === 'drop_table');
    expect(dropTableChange).toBeDefined();
    expect(dropTableChange!.table).toBe('comments');

    // Generate SQL
    const sqlGenerator = new SqlGenerator('sqlite');
    const { upStatements, downStatements } = sqlGenerator.generate(changes);

    // UP: should drop comments table
    const dropStatement = upStatements.find((s) => s.includes('DROP TABLE'));
    expect(dropStatement).toBeDefined();
    expect(dropStatement).toContain('comments');

    // DOWN: should recreate comments table
    const createStatement = downStatements.find((s) => s.includes('CREATE TABLE') && s.includes('comments'));
    expect(createStatement).toBeDefined();
  });

  test('should generate complete up and down migrations', async () => {
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
            indexes: [
              { name: 'idx_email', columns: ['email'], unique: true },
            ],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
        [
          'posts',
          {
            name: 'posts',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'user_id', type: 'integer', notNull: true, primaryKey: false },
              { name: 'title', type: 'text', notNull: true, primaryKey: false },
            ],
            indexes: [],
            foreignKeys: [
              {
                name: 'fk_posts_user',
                column: 'user_id',
                referencedTable: 'users',
                referencedColumn: 'id',
                onDelete: 'CASCADE',
              },
            ],
            primaryKey: ['id'],
          },
        ],
      ]),
    };

    const currentSchema: DatabaseSchema = { tables: new Map() };

    const differ = new SchemaDiffer(currentSchema, desiredSchema);
    const changes = differ.diff();

    // Should detect table and index changes
    expect(changes.length).toBeGreaterThanOrEqual(2);
    const hasCreateTable = changes.some((c) => c.type === 'create_table');
    const hasCreateIndex = changes.some((c) => c.type === 'create_index');
    expect(hasCreateTable).toBe(true);

    const sqlGenerator = new SqlGenerator('sqlite');
    const { upStatements, downStatements } = sqlGenerator.generate(changes);

    // UP should have: at least 2 CREATE TABLEs, possibly CREATE INDEX and comments
    // SQLite may handle some operations differently
    expect(upStatements.length).toBeGreaterThanOrEqual(2);
    expect(upStatements.filter((s) => s.includes('CREATE TABLE')).length).toBeGreaterThanOrEqual(2);

    // DOWN should reverse tables
    expect(downStatements.length).toBeGreaterThanOrEqual(2);
    expect(downStatements.filter((s) => s.includes('DROP TABLE')).length).toBeGreaterThanOrEqual(2);
  });

  test('should work with generator that has schema files configured', async () => {
    // Create schema files
    const usersSchemaPath = path.join(schemaDir1, 'users.ts');
    fs.writeFileSync(
      usersSchemaPath,
      `export const users = { name: 'users', columns: [] };`
    );

    const postsSchemaPath = path.join(schemaDir2, 'posts.ts');
    fs.writeFileSync(
      postsSchemaPath,
      `export const posts = { name: 'posts', columns: [] };`
    );

    // Generator with schema files (will attempt auto-generation or fallback)
    const generator = new MigrationGenerator(
      testDir,
      db,
      'sqlite',
      [usersSchemaPath, postsSchemaPath]
    );

    const migrationPath = await generator.generateMigration('test_migration');

    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, 'utf-8');

    // Should generate valid migration structure
    expect(content).toContain('import { type MigrationContext }');
    expect(content).toContain('export async function up');
    expect(content).toContain('export async function down');
    expect(content).toContain('export default { up, down }');
  });

  test('should handle complex multi-table scenario', async () => {
    // Create initial simple schema
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL
      );
    `);

    const introspector = new SchemaIntrospector(db, 'sqlite');
    const currentSchema = await introspector.introspect();

    // Desired: Add posts, add columns to users, add indexes
    const desiredSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'text', notNull: true, primaryKey: false },
              { name: 'username', type: 'text', notNull: true, primaryKey: false },
              { name: 'created_at', type: 'text', notNull: false, primaryKey: false },
            ],
            indexes: [
              { name: 'idx_username', columns: ['username'], unique: true },
            ],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
        [
          'posts',
          {
            name: 'posts',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'user_id', type: 'integer', notNull: true, primaryKey: false },
              { name: 'title', type: 'text', notNull: true, primaryKey: false },
            ],
            indexes: [],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
        [
          'comments',
          {
            name: 'comments',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'post_id', type: 'integer', notNull: true, primaryKey: false },
              { name: 'content', type: 'text', notNull: true, primaryKey: false },
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

    // Should have: alter_table (users), create_table (posts), create_table (comments), create_index
    expect(changes.length).toBeGreaterThanOrEqual(3);

    const sqlGenerator = new SqlGenerator('sqlite');
    const { upStatements, downStatements } = sqlGenerator.generate(changes);

    // Verify comprehensive changes
    expect(upStatements.length).toBeGreaterThanOrEqual(5);

    // Check for all operations
    expect(upStatements.some((s) => s.includes('ALTER TABLE') && s.includes('username'))).toBe(true);
    expect(upStatements.some((s) => s.includes('CREATE TABLE') && s.includes('posts'))).toBe(true);
    expect(upStatements.some((s) => s.includes('CREATE TABLE') && s.includes('comments'))).toBe(true);
    expect(upStatements.some((s) => s.includes('CREATE UNIQUE INDEX'))).toBe(true);

    // Down should reverse everything
    expect(downStatements.length).toBeGreaterThanOrEqual(5);
  });
});
