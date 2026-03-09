import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleMysql } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';
import { Migrator } from '../../src/migrator';
import { MigrationGenerator } from '../../src/generator';
import { SchemaIntrospector } from '../../src/schema-introspector';
import { SchemaLoader } from '../../src/schema-loader';
import { SchemaDiffer } from '../../src/schema-differ';

describe('Glob Pattern Auto-Generation Integration Tests', () => {
  describe('PostgreSQL - Glob Patterns', () => {
    let pool: Pool;
    let db: any;
    let testDatabase: string;
    const testSchemaDir = path.join(__dirname, 'test-glob-schemas-pg');
    const modelsDir = path.join(testSchemaDir, 'models');
    const entitiesDir = path.join(testSchemaDir, 'entities');
    const migrationsDir = path.join(__dirname, 'test-glob-migrations-pg');

    beforeAll(async () => {
      // Create test database
      const masterPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '54320'),
        user: process.env.DB_USER || 'testuser',
        password: process.env.DB_PASSWORD || 'testpass',
        database: 'postgres',
      });

      testDatabase = `test_glob_pg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await masterPool.query(`CREATE DATABASE ${testDatabase}`);
      await masterPool.end();

      // Connect to test database
      pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '54320'),
        user: process.env.DB_USER || 'testuser',
        password: process.env.DB_PASSWORD || 'testpass',
        database: testDatabase,
      });

      db = drizzlePg(pool);

      // Create schema directory structure
      fs.mkdirSync(modelsDir, { recursive: true });
      fs.mkdirSync(entitiesDir, { recursive: true });
      fs.mkdirSync(migrationsDir, { recursive: true });
    });

    afterAll(async () => {
      await pool.end();

      const masterPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '54320'),
        user: process.env.DB_USER || 'testuser',
        password: process.env.DB_PASSWORD || 'testpass',
        database: 'postgres',
      });

      await masterPool.query(`DROP DATABASE IF EXISTS ${testDatabase}`);
      await masterPool.end();

      // Cleanup directories
      fs.rmSync(testSchemaDir, { recursive: true, force: true });
      fs.rmSync(migrationsDir, { recursive: true, force: true });
    });

    beforeEach(() => {
      // Clean schema files before each test
      [modelsDir, entitiesDir].forEach((dir) => {
        if (fs.existsSync(dir)) {
          fs.readdirSync(dir).forEach((file) => {
            fs.unlinkSync(path.join(dir, file));
          });
        }
      });
    });

    it('should auto-generate from directory path', async () => {
      // Create schema files
      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `
        import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
        export const users = pgTable('users', {
          id: serial('id').primaryKey(),
          email: varchar('email', { length: 255 }).notNull().unique(),
        });
      `
      );

      fs.writeFileSync(
        path.join(modelsDir, 'post.ts'),
        `
        import { pgTable, serial, varchar, integer } from 'drizzle-orm/pg-core';
        export const posts = pgTable('posts', {
          id: serial('id').primaryKey(),
          title: varchar('title', { length: 255 }),
          userId: integer('user_id'),
        });
      `
      );

      // Use directory path (not individual files)
      const generator = new MigrationGenerator(migrationsDir, db, 'postgresql', [modelsDir]);

      const migrationPath = await generator.generateMigration('create_tables_from_dir');
      expect(fs.existsSync(migrationPath)).toBe(true);

      const content = fs.readFileSync(migrationPath, 'utf-8');
      expect(content).toContain('CREATE TABLE');
      expect(content).toContain('users');
      expect(content).toContain('posts');
      expect(content).toContain('DROP TABLE');

      // Cleanup
      fs.unlinkSync(migrationPath);
    });

    it('should auto-generate from glob pattern **/*.ts', async () => {
      // Create nested structure
      const nestedDir = path.join(modelsDir, 'nested');
      fs.mkdirSync(nestedDir, { recursive: true });

      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `
        import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
        export const users = pgTable('users', {
          id: serial('id').primaryKey(),
          name: varchar('name', { length: 255 }),
        });
      `
      );

      fs.writeFileSync(
        path.join(nestedDir, 'product.ts'),
        `
        import { pgTable, serial, varchar, decimal } from 'drizzle-orm/pg-core';
        export const products = pgTable('products', {
          id: serial('id').primaryKey(),
          name: varchar('name', { length: 255 }),
          price: decimal('price', { precision: 10, scale: 2 }),
        });
      `
      );

      // Use recursive glob pattern
      const pattern = path.join(testSchemaDir, '**/*.ts');
      const generator = new MigrationGenerator(migrationsDir, db, 'postgresql', [pattern]);

      const migrationPath = await generator.generateMigration('create_from_glob');
      const content = fs.readFileSync(migrationPath, 'utf-8');

      expect(content).toContain('users');
      expect(content).toContain('products');

      // Cleanup
      fs.unlinkSync(migrationPath);
      fs.rmSync(nestedDir, { recursive: true, force: true });
    });

    it('should auto-generate from specific pattern *.model.ts', async () => {
      fs.writeFileSync(
        path.join(modelsDir, 'user.model.ts'),
        `
        import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
        export const users = pgTable('users', {
          id: serial('id').primaryKey(),
          email: varchar('email', { length: 255 }),
        });
      `
      );

      fs.writeFileSync(
        path.join(modelsDir, 'post.entity.ts'),
        `
        import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
        export const posts = pgTable('posts', {
          id: serial('id').primaryKey(),
          title: varchar('title', { length: 255 }),
        });
      `
      );

      // Use pattern that matches only .model.ts files
      const pattern = path.join(testSchemaDir, '**/*.model.ts');
      const generator = new MigrationGenerator(migrationsDir, db, 'postgresql', [pattern]);

      const migrationPath = await generator.generateMigration('create_models_only');
      const content = fs.readFileSync(migrationPath, 'utf-8');

      expect(content).toContain('users');
      expect(content).not.toContain('posts'); // Should not include .entity.ts

      // Cleanup
      fs.unlinkSync(migrationPath);
    });

    it('should handle mixed directory and glob patterns', async () => {
      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `
        import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
        export const users = pgTable('users', {
          id: serial('id').primaryKey(),
        });
      `
      );

      fs.writeFileSync(
        path.join(entitiesDir, 'product.ts'),
        `
        import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
        export const products = pgTable('products', {
          id: serial('id').primaryKey(),
        });
      `
      );

      fs.writeFileSync(
        path.join(testSchemaDir, 'root.ts'),
        `
        import { pgTable, serial } from 'drizzle-orm/pg-core';
        export const rootTable = pgTable('root_table', {
          id: serial('id').primaryKey(),
        });
      `
      );

      // Mix directory, glob, and file
      const generator = new MigrationGenerator(migrationsDir, db, 'postgresql', [
        modelsDir, // directory
        path.join(entitiesDir, '*.ts'), // glob
        path.join(testSchemaDir, 'root.ts'), // file
      ]);

      const migrationPath = await generator.generateMigration('create_mixed');
      const content = fs.readFileSync(migrationPath, 'utf-8');

      expect(content).toContain('users');
      expect(content).toContain('products');
      expect(content).toContain('root_table');

      // Cleanup
      fs.unlinkSync(migrationPath);
      fs.unlinkSync(path.join(testSchemaDir, 'root.ts'));
    });

    it('should complete full migration flow with directory', async () => {
      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `
        import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';
        export const users = pgTable('users', {
          id: serial('id').primaryKey(),
          email: varchar('email', { length: 255 }).notNull().unique(),
          createdAt: timestamp('created_at').defaultNow(),
        });
      `
      );

      const generator = new MigrationGenerator(migrationsDir, db, 'postgresql', [modelsDir]);

      // Generate migration
      const migrationPath = await generator.generateMigration('create_users');
      expect(fs.existsSync(migrationPath)).toBe(true);

      // Verify migration content has proper SQL with columns
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('CREATE TABLE');
      expect(migrationContent).toContain('users');
      expect(migrationContent).toContain('"id"'); // id column
      expect(migrationContent).toContain('"email"'); // email column
      expect(migrationContent).toContain('"created_at"'); // created_at column
      expect(migrationContent).toContain('DROP TABLE'); // down migration

      // Cleanup
      fs.unlinkSync(migrationPath);
    });

    it('should detect schema changes with directory path', async () => {
      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `
        import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
        export const users = pgTable('users', {
          id: serial('id').primaryKey(),
          email: varchar('email', { length: 255 }),
        });
      `
      );

      // Create initial table manually
      await db.execute(sql`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255)
        )
      `);

      // Add a column to the schema file
      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `
        import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';
        export const users = pgTable('users', {
          id: serial('id').primaryKey(),
          email: varchar('email', { length: 255 }),
          createdAt: timestamp('created_at').defaultNow(),
        });
      `
      );

      // Detect changes
      const introspector = new SchemaIntrospector(db, 'postgresql');
      const currentSchema = await introspector.introspect();

      const loader = new SchemaLoader([modelsDir], 'postgresql');
      const desiredSchema = await loader.loadSchema();

      const differ = new SchemaDiffer(currentSchema, desiredSchema);
      const changes = differ.diff();

      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some((c) => c.type === 'alter_table')).toBe(true);

      // Cleanup
      await db.execute(sql`DROP TABLE users`);
    });
  });

  describe('MySQL - Glob Patterns', () => {
    let pool: mysql.Pool;
    let db: any;
    let testDatabase: string;
    const testSchemaDir = path.join(__dirname, 'test-glob-schemas-mysql');
    const modelsDir = path.join(testSchemaDir, 'models');
    const migrationsDir = path.join(__dirname, 'test-glob-migrations-mysql');

    beforeAll(async () => {
      const masterPool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT || '33060'),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || 'rootpass',
      });

      testDatabase = `test_glob_mysql_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await masterPool.query(`CREATE DATABASE \`${testDatabase}\``);
      await masterPool.end();

      pool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT || '33060'),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || 'rootpass',
        database: testDatabase,
      });

      db = drizzleMysql(pool);

      fs.mkdirSync(modelsDir, { recursive: true });
      fs.mkdirSync(migrationsDir, { recursive: true });
    });

    afterAll(async () => {
      await pool.end();

      const masterPool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT || '33060'),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || 'rootpass',
      });

      await masterPool.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``);
      await masterPool.end();

      fs.rmSync(testSchemaDir, { recursive: true, force: true });
      fs.rmSync(migrationsDir, { recursive: true, force: true });
    });

    beforeEach(() => {
      if (fs.existsSync(modelsDir)) {
        fs.readdirSync(modelsDir).forEach((file) => {
          fs.unlinkSync(path.join(modelsDir, file));
        });
      }
    });

    it('should auto-generate from glob pattern on MySQL', async () => {
      fs.writeFileSync(
        path.join(modelsDir, 'user.model.ts'),
        `
        import { mysqlTable, serial, varchar } from 'drizzle-orm/mysql-core';
        export const users = mysqlTable('users', {
          id: serial('id').primaryKey(),
          username: varchar('username', { length: 100 }).notNull(),
        });
      `
      );

      fs.writeFileSync(
        path.join(modelsDir, 'config.ts'),
        `export const config = { dbName: 'test' };`
      );

      const pattern = path.join(modelsDir, '*.model.ts');
      const generator = new MigrationGenerator(migrationsDir, db, 'mysql', [pattern]);

      const migrationPath = await generator.generateMigration('create_users_mysql');
      const content = fs.readFileSync(migrationPath, 'utf-8');

      expect(content).toContain('users');
      expect(content).not.toContain('config'); // config.ts should be ignored

      fs.unlinkSync(migrationPath);
    });

    it('should complete full flow with directory on MySQL', async () => {
      fs.writeFileSync(
        path.join(modelsDir, 'product.ts'),
        `
        import { mysqlTable, serial, varchar, int, timestamp } from 'drizzle-orm/mysql-core';
        export const products = mysqlTable('products', {
          id: serial('id').primaryKey(),
          name: varchar('name', { length: 255 }).notNull(),
          price: int('price'),
          createdAt: timestamp('created_at'),
        });
      `
      );

      const generator = new MigrationGenerator(migrationsDir, db, 'mysql', [modelsDir]);
      const migrator = new Migrator({
        db,
        dialect: 'mysql',
        config: { migrationsFolder: migrationsDir },
      });

      const migrationPath = await generator.generateMigration('create_products');
      const content = fs.readFileSync(migrationPath, 'utf-8');

      // Verify migration was generated with SQL
      expect(content).toContain('CREATE TABLE');
      expect(content).toContain('products');
      expect(content).toContain('DROP TABLE');

      fs.unlinkSync(migrationPath);
    });

    it('should handle multiple patterns on MySQL', async () => {
      const entitiesDir = path.join(testSchemaDir, 'entities');
      fs.mkdirSync(entitiesDir, { recursive: true });

      fs.writeFileSync(
        path.join(modelsDir, 'user.model.ts'),
        `
        import { mysqlTable, serial, varchar } from 'drizzle-orm/mysql-core';
        export const users = mysqlTable('users', { id: serial('id').primaryKey() });
      `
      );

      fs.writeFileSync(
        path.join(entitiesDir, 'order.entity.ts'),
        `
        import { mysqlTable, serial, int } from 'drizzle-orm/mysql-core';
        export const orders = mysqlTable('orders', { id: serial('id').primaryKey() });
      `
      );

      const patterns = [path.join(modelsDir, '*.model.ts'), path.join(entitiesDir, '*.entity.ts')];

      const generator = new MigrationGenerator(migrationsDir, db, 'mysql', patterns);
      const migrationPath = await generator.generateMigration('create_multi');
      const content = fs.readFileSync(migrationPath, 'utf-8');

      expect(content).toContain('users');
      expect(content).toContain('orders');

      fs.unlinkSync(migrationPath);
      fs.rmSync(entitiesDir, { recursive: true, force: true });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    let pool: Pool;
    let db: any;
    let testDatabase: string;
    const testSchemaDir = path.join(__dirname, 'test-glob-edge-cases');
    const migrationsDir = path.join(__dirname, 'test-glob-edge-migrations');

    beforeAll(async () => {
      const masterPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '54320'),
        user: process.env.DB_USER || 'testuser',
        password: process.env.DB_PASSWORD || 'testpass',
        database: 'postgres',
      });

      testDatabase = `test_edge_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await masterPool.query(`CREATE DATABASE ${testDatabase}`);
      await masterPool.end();

      pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '54320'),
        user: process.env.DB_USER || 'testuser',
        password: process.env.DB_PASSWORD || 'testpass',
        database: testDatabase,
      });

      db = drizzlePg(pool);
      fs.mkdirSync(testSchemaDir, { recursive: true });
      fs.mkdirSync(migrationsDir, { recursive: true });
    });

    afterAll(async () => {
      await pool.end();

      const masterPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '54320'),
        user: process.env.DB_USER || 'testuser',
        password: process.env.DB_PASSWORD || 'testpass',
        database: 'postgres',
      });

      await masterPool.query(`DROP DATABASE IF EXISTS ${testDatabase}`);
      await masterPool.end();

      fs.rmSync(testSchemaDir, { recursive: true, force: true });
      fs.rmSync(migrationsDir, { recursive: true, force: true });
    });

    it('should fallback to blank template when directory is empty', async () => {
      const emptyDir = path.join(__dirname, 'empty-test-dir-glob');
      fs.mkdirSync(emptyDir, { recursive: true });

      const generator = new MigrationGenerator(migrationsDir, db, 'postgresql', [emptyDir]);
      const migrationPath = await generator.generateMigration('empty_test');
      const content = fs.readFileSync(migrationPath, 'utf-8');

      // Should generate blank template when no schemas found
      expect(content).toContain('// Write your migration logic here');

      fs.unlinkSync(migrationPath);
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });

    it('should handle non-existent glob pattern gracefully', async () => {
      const generator = new MigrationGenerator(migrationsDir, db, 'postgresql', [
        '/non/existent/**/*.ts',
      ]);

      const migrationPath = await generator.generateMigration('non_existent');
      const content = fs.readFileSync(migrationPath, 'utf-8');

      expect(content).toContain('// Write your migration logic here');

      fs.unlinkSync(migrationPath);
    });

    it('should deduplicate schemas from overlapping patterns', async () => {
      fs.writeFileSync(
        path.join(testSchemaDir, 'user.ts'),
        `
        import { pgTable, serial } from 'drizzle-orm/pg-core';
        export const users = pgTable('users', { id: serial('id').primaryKey() });
      `
      );

      // Multiple patterns that match the same file
      const patterns = [
        path.join(testSchemaDir, 'user.ts'),
        path.join(testSchemaDir, '*.ts'),
        path.join(testSchemaDir, '**/*.ts'),
      ];

      const loader = new SchemaLoader(patterns, 'postgresql');
      const schema = await loader.loadSchema();

      // Should have users table only once
      expect(schema.tables.size).toBe(1);
      expect(schema.tables.has('users')).toBe(true);

      fs.unlinkSync(path.join(testSchemaDir, 'user.ts'));
    });
  });
});
