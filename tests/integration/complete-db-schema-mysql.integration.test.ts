import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { MigrationGenerator } from '../../src/generator';
import { Migrator } from '../../src/migrator';
import fs from 'fs';
import path from 'path';

describe('Complete DB Schema Integration Tests (MySQL)', () => {
  const testDir = path.join(__dirname, '__test_complete_schema_mysql__');
  const migrationsDir = path.join(testDir, 'migrations');
  const modelsDir = path.join(testDir, 'models');

  let connection: mysql.Connection;
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
    connection = await mysql.createConnection({
      host: 'localhost',
      port: 33060,
      user: 'root',
      password: 'rootpass',
      database: 'test_migrations',
    });

    db = drizzle(connection);

    // Initialize migrator and generator
    migrator = new Migrator({
      db,
      dialect: 'mysql',
      config: { migrationsFolder: migrationsDir },
    });

    generator = new MigrationGenerator(migrationsDir, db, 'mysql', [modelsDir]);

    // Clean up any existing tables
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

  describe('Phase 1: Initial Schema Creation', () => {
    it('should create initial schema with users and products tables', async () => {
      // Create initial schema files
      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `
import { mysqlTable, int, varchar, timestamp, boolean } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 100 }).notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});
        `
      );

      fs.writeFileSync(
        path.join(modelsDir, 'product.ts'),
        `
import { mysqlTable, int, varchar, text, timestamp, decimal, index } from 'drizzle-orm/mysql-core';
import { users } from './user';

export const products = mysqlTable('products', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  createdBy: int('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
}, (table) => [
  index('idx_products_name').on(table.name),
  index('idx_products_created_by').on(table.createdBy),
]);
        `
      );

      // Generate migration
      const migrationPath = await generator.generateMigration('create_initial_schema');
      expect(fs.existsSync(migrationPath)).toBe(true);

      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('CREATE TABLE');
      expect(migrationContent).toContain('users');
      expect(migrationContent).toContain('products');
      expect(migrationContent).toContain('FOREIGN KEY');
      expect(migrationContent).toContain('CREATE INDEX');

      // Run migration
      await migrator.runMigrations();

      // Verify tables exist
      const [tables] = await connection.query<mysql.RowDataPacket[]>(`SHOW TABLES`);
      const tableNames = tables.map((row) => Object.values(row)[0] as string);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('products');
      expect(tableNames).toContain('__drizzle_migrations');

      // Verify migration was tracked
      const [migrations] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT * FROM __drizzle_migrations ORDER BY executed_at`
      );
      expect(migrations.length).toBe(1);
      expect(migrations[0].name).toContain('create_initial_schema');

      // Verify columns
      const [userColumns] =
        await connection.query<mysql.RowDataPacket[]>(`SHOW COLUMNS FROM users`);
      const userColNames = userColumns.map((col) => col.Field);
      expect(userColNames).toContain('id');
      expect(userColNames).toContain('email');
      expect(userColNames).toContain('username');
      expect(userColNames).toContain('is_active');

      // Verify indexes
      const [indexes] = await connection.query<mysql.RowDataPacket[]>(`SHOW INDEX FROM products`);
      const indexNames = indexes.map((idx) => idx.Key_name);
      expect(indexNames).toContain('idx_products_name');
      expect(indexNames).toContain('idx_products_created_by');
    });
  });

  describe('Phase 2: Add New Table with Relations', () => {
    it('should add reviews table with foreign keys', async () => {
      fs.writeFileSync(
        path.join(modelsDir, 'review.ts'),
        `
import { mysqlTable, int, text, timestamp, index } from 'drizzle-orm/mysql-core';
import { users } from './user';
import { products } from './product';

export const reviews = mysqlTable('reviews', {
  id: int('id').primaryKey().autoincrement(),
  rating: int('rating').notNull(),
  comment: text('comment'),
  productId: int('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_reviews_product').on(table.productId),
  index('idx_reviews_user').on(table.userId),
]);
        `
      );

      const migrationPath = await generator.generateMigration('add_reviews_table');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('CREATE TABLE');
      expect(migrationContent).toContain('reviews');
      expect(migrationContent).toContain('FOREIGN KEY');

      await migrator.runMigrations();

      const [tables] = await connection.query<mysql.RowDataPacket[]>(`SHOW TABLES LIKE 'reviews'`);
      expect(tables.length).toBe(1);

      // Verify migration count
      const [migrations] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT * FROM __drizzle_migrations ORDER BY executed_at`
      );
      expect(migrations.length).toBe(2);
    });
  });

  describe('Phase 3: Add Columns to Existing Tables', () => {
    it('should add new columns to users table', async () => {
      // Update users schema with new columns
      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `
import { mysqlTable, int, varchar, timestamp, boolean, text } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 100 }).notNull(),
  isActive: boolean('is_active').default(true),
  bio: text('bio'),
  phoneNumber: varchar('phone_number', { length: 20 }),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});
        `
      );

      const migrationPath = await generator.generateMigration('add_user_profile_fields');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('ALTER TABLE');
      expect(migrationContent).toContain('ADD COLUMN');
      expect(migrationContent).toContain('bio');
      expect(migrationContent).toContain('phone_number');
      expect(migrationContent).toContain('last_login_at');

      await migrator.runMigrations();

      const [columns] = await connection.query<mysql.RowDataPacket[]>(`SHOW COLUMNS FROM users`);
      const colNames = columns.map((col) => col.Field);
      expect(colNames).toContain('bio');
      expect(colNames).toContain('phone_number');
      expect(colNames).toContain('last_login_at');
    });
  });

  describe('Phase 4: Add Indexes', () => {
    it('should add new indexes to existing tables', async () => {
      // Update products schema with additional indexes
      fs.writeFileSync(
        path.join(modelsDir, 'product.ts'),
        `
import { mysqlTable, int, varchar, text, timestamp, decimal, index } from 'drizzle-orm/mysql-core';
import { users } from './user';

export const products = mysqlTable('products', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  createdBy: int('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
}, (table) => [
  index('idx_products_name').on(table.name),
  index('idx_products_created_by').on(table.createdBy),
  index('idx_products_price').on(table.price),
  index('idx_products_created_at').on(table.createdAt),
]);
        `
      );

      const migrationPath = await generator.generateMigration('add_product_indexes');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('CREATE INDEX');

      await migrator.runMigrations();

      const [indexes] = await connection.query<mysql.RowDataPacket[]>(`SHOW INDEX FROM products`);
      const indexNames = indexes.map((idx) => idx.Key_name);
      expect(indexNames).toContain('idx_products_price');
      expect(indexNames).toContain('idx_products_created_at');
    });
  });

  describe('Phase 5: Rollback Migrations', () => {
    it('should rollback the last migration (remove indexes)', async () => {
      const [migrationsBefore] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT * FROM __drizzle_migrations ORDER BY executed_at`
      );
      const countBefore = migrationsBefore.length;

      await migrator.revertMigration(1);

      const [migrationsAfter] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT * FROM __drizzle_migrations ORDER BY executed_at`
      );
      expect(migrationsAfter.length).toBe(countBefore - 1);

      // Verify indexes were removed
      const [indexes] = await connection.query<mysql.RowDataPacket[]>(`SHOW INDEX FROM products`);
      const indexNames = indexes.map((idx) => idx.Key_name);
      expect(indexNames).not.toContain('idx_products_price');
      expect(indexNames).not.toContain('idx_products_created_at');
    });

    it('should re-apply the migration', async () => {
      await migrator.runMigrations();

      const [indexes] = await connection.query<mysql.RowDataPacket[]>(`SHOW INDEX FROM products`);
      const indexNames = indexes.map((idx) => idx.Key_name);
      expect(indexNames).toContain('idx_products_price');
      expect(indexNames).toContain('idx_products_created_at');
    });
  });

  describe('Phase 6: Drop Columns', () => {
    it('should drop columns from users table', async () => {
      // Remove bio column
      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `
import { mysqlTable, int, varchar, timestamp, boolean, text } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 100 }).notNull(),
  isActive: boolean('is_active').default(true),
  phoneNumber: varchar('phone_number', { length: 20 }),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});
        `
      );

      const migrationPath = await generator.generateMigration('remove_user_bio');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('DROP COLUMN');
      expect(migrationContent).toContain('bio');

      await migrator.runMigrations();

      const [columns] = await connection.query<mysql.RowDataPacket[]>(`SHOW COLUMNS FROM users`);
      const colNames = columns.map((col) => col.Field);
      expect(colNames).not.toContain('bio');
      expect(colNames).toContain('phone_number');
    });
  });

  describe('Phase 7: Drop Foreign Keys and Indexes', () => {
    it('should drop foreign key and index from reviews table', async () => {
      // Remove user reference from reviews
      fs.writeFileSync(
        path.join(modelsDir, 'review.ts'),
        `
import { mysqlTable, int, text, timestamp, index } from 'drizzle-orm/mysql-core';
import { products } from './product';

export const reviews = mysqlTable('reviews', {
  id: int('id').primaryKey().autoincrement(),
  rating: int('rating').notNull(),
  comment: text('comment'),
  productId: int('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  userId: int('user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_reviews_product').on(table.productId),
]);
        `
      );

      const migrationPath = await generator.generateMigration('remove_review_user_fk');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('DROP');

      await migrator.runMigrations();

      // Verify index was dropped
      const [indexes] = await connection.query<mysql.RowDataPacket[]>(`SHOW INDEX FROM reviews`);
      const indexNames = indexes.map((idx) => idx.Key_name);
      expect(indexNames).not.toContain('idx_reviews_user');
    });
  });

  describe('Phase 8: Drop Tables', () => {
    it('should drop reviews table', async () => {
      fs.unlinkSync(path.join(modelsDir, 'review.ts'));

      const migrationPath = await generator.generateMigration('drop_reviews_table');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('DROP TABLE');
      expect(migrationContent).toContain('reviews');

      await migrator.runMigrations();

      const [tables] = await connection.query<mysql.RowDataPacket[]>(`SHOW TABLES LIKE 'reviews'`);
      expect(tables.length).toBe(0);
    });
  });

  describe('Complete Migration Tracking', () => {
    it('should have tracked all migrations correctly', async () => {
      const [migrations] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT * FROM __drizzle_migrations ORDER BY executed_at`
      );

      expect(migrations.length).toBeGreaterThanOrEqual(6);

      // Verify migration names
      const migrationNames = migrations.map((m) => m.name);
      expect(migrationNames.some((name: string) => name.includes('create_initial_schema'))).toBe(
        true
      );
      expect(migrationNames.some((name: string) => name.includes('add_reviews_table'))).toBe(true);
      expect(migrationNames.some((name: string) => name.includes('add_user_profile_fields'))).toBe(
        true
      );

      // Verify all migrations have timestamps
      migrations.forEach((migration) => {
        expect(migration.executed_at).toBeTruthy();
        expect(migration.name).toBeTruthy();
      });
    });

    it('should show correct migration status', async () => {
      const status = await migrator.getStatus();

      expect(status.pending).toEqual([]);
      expect(status.executed.length).toBeGreaterThanOrEqual(6);

      status.executed.forEach((migration) => {
        expect(migration.executed_at).toBeTruthy();
      });
    });
  });

  describe('Complete Rollback', () => {
    it('should rollback all migrations', async () => {
      const [initialMigrations] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT * FROM __drizzle_migrations`
      );
      const migrationCount = initialMigrations.length;

      // Rollback all migrations one by one
      for (let i = 0; i < migrationCount; i++) {
        await migrator.revertMigration(1);
      }

      // Verify all tables are gone except migrations table
      const [tables] = await connection.query<mysql.RowDataPacket[]>(`SHOW TABLES`);
      const tableNames = tables.map((row) => Object.values(row)[0] as string);
      expect(tableNames).toEqual(['__drizzle_migrations']);

      // Verify no migrations in tracking table
      const [remainingMigrations] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT * FROM __drizzle_migrations`
      );
      expect(remainingMigrations.length).toBe(0);
    });

    it('should be able to re-apply all migrations', async () => {
      await migrator.runMigrations();

      const [tables] = await connection.query<mysql.RowDataPacket[]>(`SHOW TABLES`);
      const tableNames = tables.map((row) => Object.values(row)[0] as string);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('products');

      const [migrations] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT * FROM __drizzle_migrations`
      );
      expect(migrations.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('One-Go Complete Migration', () => {
    it('should apply all pending migrations at once', async () => {
      // First rollback all
      const [initialMigrations] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT * FROM __drizzle_migrations`
      );

      for (let i = 0; i < initialMigrations.length; i++) {
        await migrator.revertMigration(1);
      }

      // Now apply all at once
      await migrator.runMigrations();

      // Verify all tables exist
      const [tables] = await connection.query<mysql.RowDataPacket[]>(`SHOW TABLES`);
      const tableNames = tables.map((row) => Object.values(row)[0] as string);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('products');
      expect(tableNames).toContain('__drizzle_migrations');

      // Verify all migrations tracked
      const [migrations] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT * FROM __drizzle_migrations`
      );
      expect(migrations.length).toBeGreaterThanOrEqual(6);
    });
  });
});
