import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';
import { Migrator } from '../../src/migrator';
import { SchemaIntrospector } from '../../src/schema-introspector';
import { SchemaLoader } from '../../src/schema-loader';
import { SchemaDiffer } from '../../src/schema-differ';
import { SqlGenerator } from '../../src/sql-generator';

describe('Schema Commands Integration Tests', () => {
  let masterPool: mysql.Pool;
  let pool: mysql.Pool;
  let db: any;
  let testDir: string;
  let schemaDir: string;
  let migrator: Migrator;
  let testDatabase: string;

  beforeAll(async () => {
    masterPool = mysql.createPool({
      host: 'localhost',
      port: 33060,
      user: 'root',
      password: 'rootpass',
    });
  });

  afterAll(async () => {
    await masterPool.end();
  });

  beforeEach(async () => {
    const testId = Math.random().toString(36).substring(7);
    testDatabase = `test_schema_${testId}`;
    testDir = path.join(__dirname, `../test-schema-${testId}`);
    schemaDir = path.join(testDir, 'schema');

    await masterPool.query(`CREATE DATABASE ${testDatabase}`);

    pool = mysql.createPool({
      host: 'localhost',
      port: 33060,
      user: 'root',
      password: 'rootpass',
      database: testDatabase,
    });

    db = drizzle(pool);
    fs.mkdirSync(schemaDir, { recursive: true });

    migrator = new Migrator({
      db,
      dialect: 'mysql',
      config: {
        migrationsFolder: path.join(testDir, 'migrations'),
        schemaFiles: [schemaDir],
      },
    });

    await migrator.initialize();
  });

  afterEach(async () => {
    await pool.end();
    try {
      await masterPool.query(`DROP DATABASE IF EXISTS ${testDatabase}`);
    } catch (e) {
      // Ignore cleanup errors
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Schema Introspection', () => {
    test('should introspect empty database', async () => {
      const introspector = new SchemaIntrospector(db, 'mysql');
      const schema = await introspector.introspect();

      // Should only have migrations table
      expect(schema.tables.size).toBeLessThanOrEqual(1);
    });

    test('should introspect tables with columns', async () => {
      // Create a table
      await pool.query(`
        CREATE TABLE users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(255) NOT NULL UNIQUE,
          name VARCHAR(100),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const introspector = new SchemaIntrospector(db, 'mysql');
      const schema = await introspector.introspect();

      expect(schema.tables.has('users')).toBe(true);

      const usersTable = schema.tables.get('users')!;
      expect(usersTable.columns.length).toBe(5);
      const columnNames = usersTable.columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('email');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('is_active');
      expect(columnNames).toContain('created_at');
    });

    test('should introspect indexes', async () => {
      await pool.query(`
        CREATE TABLE posts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          slug VARCHAR(255) UNIQUE,
          category_id INT,
          INDEX idx_category (category_id)
        )
      `);

      const introspector = new SchemaIntrospector(db, 'mysql');
      const schema = await introspector.introspect();

      const postsTable = schema.tables.get('posts')!;
      expect(postsTable.indexes.length).toBeGreaterThan(0);

      const categoryIndex = postsTable.indexes.find((i) => i.name === 'idx_category');
      expect(categoryIndex).toBeDefined();
      expect(categoryIndex!.columns).toContain('category_id');
    });

    test('should introspect foreign keys', async () => {
      await pool.query(`
        CREATE TABLE users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100)
        )
      `);

      await pool.query(`
        CREATE TABLE posts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          title VARCHAR(255),
          CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      const introspector = new SchemaIntrospector(db, 'mysql');
      const schema = await introspector.introspect();

      const postsTable = schema.tables.get('posts')!;
      expect(postsTable.foreignKeys.length).toBe(1);

      const fk = postsTable.foreignKeys[0];
      expect(fk.column).toBe('user_id');
      expect(fk.referencedTable).toBe('users');
      expect(fk.referencedColumn).toBe('id');
    });
  });

  describe('Schema Loading', () => {
    test('should load schema from TypeScript file', async () => {
      // Create schema file
      fs.writeFileSync(
        path.join(schemaDir, 'users.ts'),
        `
import { mysqlTable, int, varchar, boolean, timestamp } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});
        `
      );

      const loader = new SchemaLoader([schemaDir], 'mysql');
      const schema = await loader.loadSchema();

      expect(schema.tables.has('users')).toBe(true);

      const usersTable = schema.tables.get('users')!;
      expect(usersTable.columns.length).toBe(5);
    });

    test('should load multiple schema files', async () => {
      fs.writeFileSync(
        path.join(schemaDir, 'users.ts'),
        `
import { mysqlTable, int, varchar } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 100 }),
});
        `
      );

      fs.writeFileSync(
        path.join(schemaDir, 'posts.ts'),
        `
import { mysqlTable, int, varchar } from 'drizzle-orm/mysql-core';

export const posts = mysqlTable('posts', {
  id: int('id').primaryKey().autoincrement(),
  title: varchar('title', { length: 255 }),
});
        `
      );

      const loader = new SchemaLoader([schemaDir], 'mysql');
      const schema = await loader.loadSchema();

      expect(schema.tables.has('users')).toBe(true);
      expect(schema.tables.has('posts')).toBe(true);
    });
  });

  describe('Schema Diffing', () => {
    test('should detect new table', async () => {
      // Create schema file with new table
      fs.writeFileSync(
        path.join(schemaDir, 'users.ts'),
        `
import { mysqlTable, int, varchar } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 100 }),
});
        `
      );

      // Introspect current (empty) database
      const introspector = new SchemaIntrospector(db, 'mysql');
      const currentSchema = await introspector.introspect();

      // Load desired schema
      const loader = new SchemaLoader([schemaDir], 'mysql');
      const desiredSchema = await loader.loadSchema();

      // Diff
      const differ = new SchemaDiffer(currentSchema, desiredSchema);
      const changes = differ.diff();

      expect(changes.length).toBeGreaterThan(0);

      const createTableChange = changes.find(
        (c) => c.type === 'create_table' && c.table === 'users'
      );
      expect(createTableChange).toBeDefined();
    });

    test('should detect dropped table', async () => {
      // Create table in database
      await pool.query(`
        CREATE TABLE old_table (
          id INT AUTO_INCREMENT PRIMARY KEY
        )
      `);

      // Empty schema (no tables defined)
      const introspector = new SchemaIntrospector(db, 'mysql');
      const currentSchema = await introspector.introspect();

      const loader = new SchemaLoader([], 'mysql');
      const desiredSchema = await loader.loadSchema();

      const differ = new SchemaDiffer(currentSchema, desiredSchema);
      const changes = differ.diff();

      const dropTableChange = changes.find(
        (c) => c.type === 'drop_table' && c.table === 'old_table'
      );
      expect(dropTableChange).toBeDefined();
    });

    test('should detect added column', async () => {
      // Create table without name column
      await pool.query(`
        CREATE TABLE users (
          id INT AUTO_INCREMENT PRIMARY KEY
        )
      `);

      // Schema with name column
      fs.writeFileSync(
        path.join(schemaDir, 'users.ts'),
        `
import { mysqlTable, int, varchar } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 100 }),
});
        `
      );

      const introspector = new SchemaIntrospector(db, 'mysql');
      const currentSchema = await introspector.introspect();

      const loader = new SchemaLoader([schemaDir], 'mysql');
      const desiredSchema = await loader.loadSchema();

      const differ = new SchemaDiffer(currentSchema, desiredSchema);
      const changes = differ.diff();

      const alterTableChange = changes.find((c) => c.type === 'alter_table' && c.table === 'users');
      expect(alterTableChange).toBeDefined();

      const addColumnChange = alterTableChange?.details?.changes?.find(
        (tc: any) => tc.type === 'add_column' && tc.column === 'name'
      );
      expect(addColumnChange).toBeDefined();
    });
  });

  describe('SQL Generation', () => {
    test('should generate CREATE TABLE SQL', async () => {
      fs.writeFileSync(
        path.join(schemaDir, 'users.ts'),
        `
import { mysqlTable, int, varchar } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 100 }),
});
        `
      );

      const introspector = new SchemaIntrospector(db, 'mysql');
      const currentSchema = await introspector.introspect();

      const loader = new SchemaLoader([schemaDir], 'mysql');
      const desiredSchema = await loader.loadSchema();

      const differ = new SchemaDiffer(currentSchema, desiredSchema);
      const changes = differ.diff();

      const sqlGenerator = new SqlGenerator('mysql');
      const { upStatements, downStatements } = sqlGenerator.generate(changes);

      expect(upStatements.length).toBeGreaterThan(0);
      expect(upStatements.some((s) => s.includes('CREATE TABLE'))).toBe(true);
      expect(downStatements.some((s) => s.includes('DROP TABLE'))).toBe(true);
    });

    test('should generate ALTER TABLE SQL', async () => {
      // Create table
      await pool.query(`
        CREATE TABLE users (
          id INT AUTO_INCREMENT PRIMARY KEY
        )
      `);

      fs.writeFileSync(
        path.join(schemaDir, 'users.ts'),
        `
import { mysqlTable, int, varchar } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  email: varchar('email', { length: 255 }).notNull(),
});
        `
      );

      const introspector = new SchemaIntrospector(db, 'mysql');
      const currentSchema = await introspector.introspect();

      const loader = new SchemaLoader([schemaDir], 'mysql');
      const desiredSchema = await loader.loadSchema();

      const differ = new SchemaDiffer(currentSchema, desiredSchema);
      const changes = differ.diff();

      const sqlGenerator = new SqlGenerator('mysql');
      const { upStatements } = sqlGenerator.generate(changes);

      expect(upStatements.some((s) => s.includes('ALTER TABLE'))).toBe(true);
      expect(upStatements.some((s) => s.includes('ADD'))).toBe(true);
    });
  });
});
