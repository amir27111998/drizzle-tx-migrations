import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { MigrationGenerator } from '../../src/generator';
import { Migrator } from '../../src/migrator';
import fs from 'fs';
import path from 'path';

describe('Complete DB Schema Integration Tests (PostgreSQL)', () => {
  const testDir = path.join(__dirname, '__test_complete_schema__');
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

    // Initialize migrator and generator
    migrator = new Migrator({
      db,
      dialect: 'postgresql',
      config: { migrationsFolder: migrationsDir },
    });

    generator = new MigrationGenerator(migrationsDir, db, 'postgresql', [modelsDir]);

    // Clean up any existing tables
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
  });

  afterAll(async () => {
    await pool.end();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Phase 1: Initial Schema Creation', () => {
    it('should create initial schema with users and posts tables', async () => {
      // Create initial schema files
      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `
import { pgTable, serial, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 100 }).notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
        `
      );

      fs.writeFileSync(
        path.join(modelsDir, 'post.ts'),
        `
import { pgTable, serial, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { users } from './user';

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  authorId: integer('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
  publishedAt: timestamp('published_at'),
}, (table) => [
  index('idx_posts_author').on(table.authorId),
  index('idx_posts_created').on(table.createdAt),
]);
        `
      );

      // Generate migration
      const migrationPath = await generator.generateMigration('create_initial_schema');
      expect(fs.existsSync(migrationPath)).toBe(true);

      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('CREATE TABLE "users"');
      expect(migrationContent).toContain('CREATE TABLE "posts"');
      expect(migrationContent).toContain('FOREIGN KEY');
      expect(migrationContent).toContain('CREATE INDEX');

      // Run migration
      await migrator.runMigrations();

      // Verify tables exist
      const tablesResult = await pool.query<{ table_name: string }>(
        `SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
      );
      const tableNames = tablesResult.rows.map((t) => t.table_name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('posts');
      expect(tableNames).toContain('__drizzle_migrations');

      // Verify migration was tracked
      const migrationsResult = await pool.query(
        `SELECT * FROM __drizzle_migrations ORDER BY executed_at`
      );
      expect(migrationsResult.rows.length).toBe(1);
      expect(migrationsResult.rows[0].name).toContain('create_initial_schema');

      // Verify columns
      const userColumnsResult = await pool.query<{ column_name: string }>(
        `SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'users'`
      );
      const userColNames = userColumnsResult.rows.map((c) => c.column_name);
      expect(userColNames).toContain('id');
      expect(userColNames).toContain('email');
      expect(userColNames).toContain('username');
      expect(userColNames).toContain('is_active');

      // Verify indexes
      const indexesResult = await pool.query<{ indexname: string }>(
        `SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'posts'`
      );
      const indexNames = indexesResult.rows.map((i) => i.indexname);
      expect(indexNames).toContain('idx_posts_author');
      expect(indexNames).toContain('idx_posts_created');

      // Verify foreign key
      const foreignKeysResult = await pool.query<{ constraint_name: string }>(
        `SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'posts' AND constraint_type = 'FOREIGN KEY'`
      );
      expect(foreignKeysResult.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Phase 2: Add New Table with Relations', () => {
    it('should add comments table with foreign keys', async () => {
      fs.writeFileSync(
        path.join(modelsDir, 'comment.ts'),
        `
import { pgTable, serial, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { users } from './user';
import { posts } from './post';

export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  authorId: integer('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_comments_post').on(table.postId),
  index('idx_comments_author').on(table.authorId),
]);
        `
      );

      const migrationPath = await generator.generateMigration('add_comments_table');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('CREATE TABLE "comments"');
      expect(migrationContent).toContain('FOREIGN KEY');

      await migrator.runMigrations();

      const tablesResult = await pool.query<{ table_name: string }>(
        `SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'comments'`
      );
      expect(tablesResult.rows.length).toBe(1);

      // Verify migration count
      const migrationsResult = await pool.query(
        `SELECT * FROM __drizzle_migrations ORDER BY executed_at`
      );
      expect(migrationsResult.rows.length).toBe(2);
    });
  });

  describe('Phase 3: Add Columns to Existing Tables', () => {
    it('should add new columns to users table', async () => {
      // Update users schema with new columns
      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `
import { pgTable, serial, varchar, timestamp, boolean, text } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 100 }).notNull(),
  isActive: boolean('is_active').default(true),
  bio: text('bio'),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
        `
      );

      const migrationPath = await generator.generateMigration('add_user_profile_fields');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('ALTER TABLE');
      expect(migrationContent).toContain('ADD COLUMN');
      expect(migrationContent).toContain('bio');
      expect(migrationContent).toContain('avatar_url');
      expect(migrationContent).toContain('last_login_at');

      await migrator.runMigrations();

      const columnsResult = await pool.query<{ column_name: string }>(
        `SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'users'`
      );
      const colNames = columnsResult.rows.map((c) => c.column_name);
      expect(colNames).toContain('bio');
      expect(colNames).toContain('avatar_url');
      expect(colNames).toContain('last_login_at');
    });
  });

  describe('Phase 4: Add Indexes', () => {
    it('should add new indexes to existing tables', async () => {
      // Update posts schema with additional indexes
      fs.writeFileSync(
        path.join(modelsDir, 'post.ts'),
        `
import { pgTable, serial, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { users } from './user';

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  authorId: integer('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
  publishedAt: timestamp('published_at'),
}, (table) => [
  index('idx_posts_author').on(table.authorId),
  index('idx_posts_created').on(table.createdAt),
  index('idx_posts_published').on(table.publishedAt),
  index('idx_posts_title').on(table.title),
]);
        `
      );

      const migrationPath = await generator.generateMigration('add_post_indexes');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('CREATE INDEX');

      await migrator.runMigrations();

      const indexesResult = await pool.query<{ indexname: string }>(
        `SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'posts'`
      );
      const indexNames = indexesResult.rows.map((i) => i.indexname);
      expect(indexNames).toContain('idx_posts_published');
      expect(indexNames).toContain('idx_posts_title');
    });
  });

  describe('Phase 5: Rollback Migrations', () => {
    it('should rollback the last migration (remove indexes)', async () => {
      const migrationsBeforeResult = await pool.query(
        `SELECT * FROM __drizzle_migrations ORDER BY executed_at`
      );
      const countBefore = migrationsBeforeResult.rows.length;

      await migrator.revertMigration(1);

      const migrationsAfterResult = await pool.query(
        `SELECT * FROM __drizzle_migrations ORDER BY executed_at`
      );
      expect(migrationsAfterResult.rows.length).toBe(countBefore - 1);

      // Verify indexes were removed
      const indexesResult = await pool.query<{ indexname: string }>(
        `SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'posts'`
      );
      const indexNames = indexesResult.rows.map((i) => i.indexname);
      expect(indexNames).not.toContain('idx_posts_published');
      expect(indexNames).not.toContain('idx_posts_title');
    });

    it('should re-apply the migration', async () => {
      await migrator.runMigrations();

      const indexesResult = await pool.query<{ indexname: string }>(
        `SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'posts'`
      );
      const indexNames = indexesResult.rows.map((i) => i.indexname);
      expect(indexNames).toContain('idx_posts_published');
      expect(indexNames).toContain('idx_posts_title');
    });
  });

  describe('Phase 6: Drop Columns', () => {
    it('should drop columns from users table', async () => {
      // Remove bio column
      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `
import { pgTable, serial, varchar, timestamp, boolean, text } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 100 }).notNull(),
  isActive: boolean('is_active').default(true),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
        `
      );

      const migrationPath = await generator.generateMigration('remove_user_bio');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('DROP COLUMN');
      expect(migrationContent).toContain('bio');

      await migrator.runMigrations();

      const columnsResult = await pool.query<{ column_name: string }>(
        `SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'users'`
      );
      const colNames = columnsResult.rows.map((c) => c.column_name);
      expect(colNames).not.toContain('bio');
      expect(colNames).toContain('avatar_url');
    });
  });

  describe('Phase 7: Drop Foreign Keys and Indexes', () => {
    it('should drop foreign key from comments table', async () => {
      // Remove author reference from comments
      fs.writeFileSync(
        path.join(modelsDir, 'comment.ts'),
        `
import { pgTable, serial, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { posts } from './post';

export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  authorId: integer('author_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_comments_post').on(table.postId),
]);
        `
      );

      const migrationPath = await generator.generateMigration('remove_comment_author_fk');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('DROP');

      await migrator.runMigrations();

      // Verify index was dropped
      const indexesResult = await pool.query<{ indexname: string }>(
        `SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'comments'`
      );
      const indexNames = indexesResult.rows.map((i) => i.indexname);
      expect(indexNames).not.toContain('idx_comments_author');
    });
  });

  describe('Phase 8: Drop Tables', () => {
    it('should drop comments table', async () => {
      fs.unlinkSync(path.join(modelsDir, 'comment.ts'));

      const migrationPath = await generator.generateMigration('drop_comments_table');
      const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(migrationContent).toContain('DROP TABLE');
      expect(migrationContent).toContain('comments');

      await migrator.runMigrations();

      const tablesResult = await pool.query<{ table_name: string }>(
        `SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'comments'`
      );
      expect(tablesResult.rows.length).toBe(0);
    });
  });

  describe('Complete Migration Tracking', () => {
    it('should have tracked all migrations correctly', async () => {
      const migrationsResult = await pool.query(
        `SELECT * FROM __drizzle_migrations ORDER BY executed_at`
      );
      const migrations = migrationsResult.rows;

      expect(migrations.length).toBeGreaterThanOrEqual(6);

      // Verify migration names
      const migrationNames = migrations.map((m: any) => m.name);
      expect(migrationNames.some((name: string) => name.includes('create_initial_schema'))).toBe(
        true
      );
      expect(migrationNames.some((name: string) => name.includes('add_comments_table'))).toBe(true);
      expect(migrationNames.some((name: string) => name.includes('add_user_profile_fields'))).toBe(
        true
      );

      // Verify all migrations have timestamps
      migrations.forEach((migration: any) => {
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
      const initialMigrationsResult = await pool.query(`SELECT * FROM __drizzle_migrations`);
      const migrationCount = initialMigrationsResult.rows.length;

      // Rollback all migrations one by one
      for (let i = 0; i < migrationCount; i++) {
        await migrator.revertMigration(1);
      }

      // Verify all tables are gone except migrations table
      const tablesResult = await pool.query<{ table_name: string }>(
        `SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
      );
      const tableNames = tablesResult.rows.map((t) => t.table_name);
      expect(tableNames).toEqual(['__drizzle_migrations']);

      // Verify no migrations in tracking table
      const remainingMigrationsResult = await pool.query(`SELECT * FROM __drizzle_migrations`);
      expect(remainingMigrationsResult.rows.length).toBe(0);
    });

    it('should be able to re-apply all migrations', async () => {
      await migrator.runMigrations();

      const tablesResult = await pool.query<{ table_name: string }>(
        `SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
      );
      const tableNames = tablesResult.rows.map((t) => t.table_name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('posts');

      const migrationsResult = await pool.query(`SELECT * FROM __drizzle_migrations`);
      expect(migrationsResult.rows.length).toBeGreaterThanOrEqual(6);
    });
  });
});
