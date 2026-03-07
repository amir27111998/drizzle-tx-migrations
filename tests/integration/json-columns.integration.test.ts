import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { drizzle as drizzleMysql } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { MigrationGenerator } from '../../src/generator';
import { Migrator } from '../../src/migrator';
import fs from 'fs';
import path from 'path';

describe('JSON Columns Integration Tests', () => {
  describe('PostgreSQL JSON/JSONB Columns', () => {
    const testDir = path.join(__dirname, '__test_json_pg__');
    const migrationsDir = path.join(testDir, 'migrations');
    const modelsDir = path.join(testDir, 'models');

    let pool: Pool;
    let db: ReturnType<typeof drizzle>;
    let migrator: Migrator;
    let generator: MigrationGenerator;

    beforeAll(async () => {
      // Setup directories
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
      fs.mkdirSync(testDir, { recursive: true });
      fs.mkdirSync(migrationsDir, { recursive: true });
      fs.mkdirSync(modelsDir, { recursive: true });

      // Connect to test database
      pool = new Pool({
        host: 'localhost',
        port: 54320,
        database: 'test_migrations',
        user: 'testuser',
        password: 'testpass',
      });

      db = drizzle(pool);

      migrator = new Migrator({
        db,
        dialect: 'postgresql',
        config: { migrationsFolder: migrationsDir },
      });

      generator = new MigrationGenerator(migrationsDir, db, 'postgresql', [modelsDir]);

      // Clean up
      await pool.query('DROP SCHEMA public CASCADE');
      await pool.query('CREATE SCHEMA public');
    });

    afterAll(async () => {
      await pool.end();
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should create table with JSON and JSONB columns', async () => {
      // Create schema with JSON columns
      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `
import { pgTable, serial, varchar, json, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  settings: json('settings'),
  metadata: jsonb('metadata'),
});
        `
      );

      const migrationPath = await generator.generateMigration('create_users_with_json');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

      expect(migrationContent).toContain('CREATE TABLE "users"');
      expect(migrationContent).toContain('JSON');
      expect(migrationContent).toContain('JSONB');

      await migrator.runMigrations();

      // Verify columns exist with correct types
      const result = await pool.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name IN ('settings', 'metadata')`
      );

      const settingsCol = result.rows.find((r) => r.column_name === 'settings');
      const metadataCol = result.rows.find((r) => r.column_name === 'metadata');

      expect(settingsCol?.data_type).toBe('json');
      expect(metadataCol?.data_type).toBe('jsonb');
    });

    it('should insert and query JSON data', async () => {
      // Insert data with JSON
      await pool.query(
        `INSERT INTO users (email, settings, metadata) VALUES ($1, $2, $3)`,
        [
          'test@example.com',
          JSON.stringify({ theme: 'dark', language: 'en' }),
          JSON.stringify({ lastLogin: '2025-01-01', roles: ['admin', 'user'] }),
        ]
      );

      // Query and verify
      const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [
        'test@example.com',
      ]);

      expect(result.rows.length).toBe(1);
      const user = result.rows[0];
      expect(user.settings).toEqual({ theme: 'dark', language: 'en' });
      expect(user.metadata).toEqual({ lastLogin: '2025-01-01', roles: ['admin', 'user'] });
    });

    it('should add JSON column to existing table', async () => {
      // Update schema to add new JSON column
      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `
import { pgTable, serial, varchar, json, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  settings: json('settings'),
  metadata: jsonb('metadata'),
  preferences: jsonb('preferences'),
});
        `
      );

      const migrationPath = await generator.generateMigration('add_preferences_column');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

      expect(migrationContent).toContain('ALTER TABLE');
      expect(migrationContent).toContain('ADD COLUMN');
      expect(migrationContent).toContain('preferences');
      expect(migrationContent).toContain('JSONB');

      await migrator.runMigrations();

      // Verify column was added
      const result = await pool.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'preferences'`
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].data_type).toBe('jsonb');
    });
  });

  describe('MySQL JSON Columns', () => {
    const testDir = path.join(__dirname, '__test_json_mysql__');
    const migrationsDir = path.join(testDir, 'migrations');
    const modelsDir = path.join(testDir, 'models');

    let connection: mysql.Connection;
    let db: ReturnType<typeof drizzleMysql>;
    let migrator: Migrator;
    let generator: MigrationGenerator;

    beforeAll(async () => {
      // Setup directories
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
      fs.mkdirSync(testDir, { recursive: true });
      fs.mkdirSync(migrationsDir, { recursive: true });
      fs.mkdirSync(modelsDir, { recursive: true });

      // Connect to test database
      connection = await mysql.createConnection({
        host: 'localhost',
        port: 33060,
        user: 'root',
        password: 'rootpass',
        database: 'test_migrations',
      });

      db = drizzleMysql(connection);

      migrator = new Migrator({
        db,
        dialect: 'mysql',
        config: { migrationsFolder: migrationsDir },
      });

      generator = new MigrationGenerator(migrationsDir, db, 'mysql', [modelsDir]);

      // Clean up existing tables
      const [tables] = await connection.query<mysql.RowDataPacket[]>(`SHOW TABLES`);
      for (const row of tables) {
        const tableName = Object.values(row)[0];
        await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
      }
    });

    afterAll(async () => {
      await connection.end();
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should create table with JSON columns', async () => {
      // Create schema with JSON columns
      fs.writeFileSync(
        path.join(modelsDir, 'product.ts'),
        `
import { mysqlTable, int, varchar, json } from 'drizzle-orm/mysql-core';

export const products = mysqlTable('products', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull(),
  attributes: json('attributes'),
  tags: json('tags'),
});
        `
      );

      const migrationPath = await generator.generateMigration('create_products_with_json');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

      expect(migrationContent).toContain('CREATE TABLE');
      expect(migrationContent).toContain('products');
      expect(migrationContent).toContain('JSON');

      await migrator.runMigrations();

      // Verify columns exist with correct types
      const [columns] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'products' AND COLUMN_NAME IN ('attributes', 'tags')
        AND TABLE_SCHEMA = 'test_migrations'`
      );

      expect(columns.length).toBe(2);
      columns.forEach((col) => {
        expect(col.DATA_TYPE).toBe('json');
      });
    });

    it('should insert and query JSON data', async () => {
      // Insert data with JSON
      await connection.query(
        `INSERT INTO products (name, attributes, tags) VALUES (?, ?, ?)`,
        [
          'Widget',
          JSON.stringify({ color: 'blue', size: 'large', weight: 100 }),
          JSON.stringify(['electronics', 'gadgets', 'new']),
        ]
      );

      // Query and verify
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT * FROM products WHERE name = ?`,
        ['Widget']
      );

      expect(rows.length).toBe(1);
      const product = rows[0];
      expect(product.attributes).toEqual({ color: 'blue', size: 'large', weight: 100 });
      expect(product.tags).toEqual(['electronics', 'gadgets', 'new']);
    });

    it('should add JSON column to existing table', async () => {
      // Update schema to add new JSON column
      fs.writeFileSync(
        path.join(modelsDir, 'product.ts'),
        `
import { mysqlTable, int, varchar, json } from 'drizzle-orm/mysql-core';

export const products = mysqlTable('products', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull(),
  attributes: json('attributes'),
  tags: json('tags'),
  specs: json('specs'),
});
        `
      );

      const migrationPath = await generator.generateMigration('add_specs_column');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

      expect(migrationContent).toContain('ALTER TABLE');
      expect(migrationContent).toContain('ADD COLUMN');
      expect(migrationContent).toContain('specs');
      expect(migrationContent).toContain('JSON');

      await migrator.runMigrations();

      // Verify column was added
      const [columns] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'products' AND COLUMN_NAME = 'specs'
        AND TABLE_SCHEMA = 'test_migrations'`
      );

      expect(columns.length).toBe(1);
      expect(columns[0].DATA_TYPE).toBe('json');
    });

    it('should handle NULL JSON values', async () => {
      await connection.query(
        `INSERT INTO products (name, attributes, tags, specs) VALUES (?, ?, ?, ?)`,
        ['NullTest', null, null, null]
      );

      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT * FROM products WHERE name = ?`,
        ['NullTest']
      );

      expect(rows.length).toBe(1);
      expect(rows[0].attributes).toBeNull();
      expect(rows[0].tags).toBeNull();
      expect(rows[0].specs).toBeNull();
    });
  });
});
