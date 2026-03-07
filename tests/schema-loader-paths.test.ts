import * as fs from 'fs';
import * as path from 'path';
import { SchemaLoader } from '../src/schema-loader';

describe('SchemaLoader - Directory and Glob Support', () => {
  const testDir = path.join(__dirname, 'test-schemas');
  const schemaDir = path.join(testDir, 'schema');
  const modelsDir = path.join(schemaDir, 'models');

  beforeAll(() => {
    // Create test directory structure
    fs.mkdirSync(modelsDir, { recursive: true });

    // Create schema files in different locations
    fs.writeFileSync(
      path.join(schemaDir, 'users.ts'),
      `
      import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

      export const users = pgTable('users', {
        id: serial('id').primaryKey(),
        name: varchar('name', { length: 255 }).notNull(),
        email: varchar('email', { length: 255 }).notNull().unique(),
      });
    `
    );

    fs.writeFileSync(
      path.join(modelsDir, 'posts.ts'),
      `
      import { pgTable, serial, varchar, integer } from 'drizzle-orm/pg-core';

      export const posts = pgTable('posts', {
        id: serial('id').primaryKey(),
        title: varchar('title', { length: 255 }).notNull(),
        userId: integer('user_id').notNull(),
      });
    `
    );

    fs.writeFileSync(
      path.join(modelsDir, 'comments.ts'),
      `
      import { pgTable, serial, varchar, integer } from 'drizzle-orm/pg-core';

      export const comments = pgTable('comments', {
        id: serial('id').primaryKey(),
        content: varchar('content', { length: 1000 }).notNull(),
        postId: integer('post_id').notNull(),
      });
    `
    );

    // Create a non-schema file that should be ignored
    fs.writeFileSync(
      path.join(schemaDir, 'config.ts'),
      `
      export const config = {
        database: 'mydb'
      };
    `
    );
  });

  afterAll(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should load schemas from a directory path', async () => {
    const loader = new SchemaLoader([schemaDir], 'postgresql');
    const schema = await loader.loadSchema();

    expect(schema.tables.size).toBeGreaterThanOrEqual(3);
    expect(schema.tables.has('users')).toBe(true);
    expect(schema.tables.has('posts')).toBe(true);
    expect(schema.tables.has('comments')).toBe(true);
  });

  it('should load schemas from a nested directory', async () => {
    const loader = new SchemaLoader([modelsDir], 'postgresql');
    const schema = await loader.loadSchema();

    expect(schema.tables.size).toBeGreaterThanOrEqual(2);
    expect(schema.tables.has('posts')).toBe(true);
    expect(schema.tables.has('comments')).toBe(true);
  });

  it('should load schemas using glob pattern', async () => {
    const globPattern = path.join(schemaDir, '**/*.ts');
    const loader = new SchemaLoader([globPattern], 'postgresql');
    const schema = await loader.loadSchema();

    expect(schema.tables.size).toBeGreaterThanOrEqual(3);
    expect(schema.tables.has('users')).toBe(true);
    expect(schema.tables.has('posts')).toBe(true);
    expect(schema.tables.has('comments')).toBe(true);
  });

  it('should load schemas using models-only glob pattern', async () => {
    const globPattern = path.join(schemaDir, 'models/*.ts');
    const loader = new SchemaLoader([globPattern], 'postgresql');
    const schema = await loader.loadSchema();

    expect(schema.tables.size).toBe(2);
    expect(schema.tables.has('posts')).toBe(true);
    expect(schema.tables.has('comments')).toBe(true);
    expect(schema.tables.has('users')).toBe(false); // users is not in models/
  });

  it('should handle mixed file, directory, and glob patterns', async () => {
    const usersFile = path.join(schemaDir, 'users.ts');
    const globPattern = path.join(schemaDir, 'models/*.ts');

    const loader = new SchemaLoader([usersFile, globPattern], 'postgresql');
    const schema = await loader.loadSchema();

    expect(schema.tables.size).toBeGreaterThanOrEqual(3);
    expect(schema.tables.has('users')).toBe(true);
    expect(schema.tables.has('posts')).toBe(true);
    expect(schema.tables.has('comments')).toBe(true);
  });

  it('should handle non-existent paths gracefully', async () => {
    const loader = new SchemaLoader(['/non/existent/path'], 'postgresql');
    const schema = await loader.loadSchema();

    expect(schema.tables.size).toBe(0);
  });

  it('should remove duplicate files when using overlapping patterns', async () => {
    const usersFile = path.join(schemaDir, 'users.ts');
    const schemaPattern = path.join(schemaDir, '*.ts');

    const loader = new SchemaLoader([usersFile, schemaPattern], 'postgresql');
    const schema = await loader.loadSchema();

    // Should not have duplicate tables
    expect(schema.tables.size).toBe(1); // Only users (config.ts is ignored)
    expect(schema.tables.has('users')).toBe(true);
  });

  it('should find tables from directory-loaded schemas', async () => {
    const loader = new SchemaLoader([schemaDir], 'postgresql');
    const schema = await loader.loadSchema();

    const usersTable = schema.tables.get('users');
    expect(usersTable).toBeDefined();
    expect(usersTable!.name).toBe('users');

    // Verify table was loaded (columns may vary based on parsing)
    expect(schema.tables.has('users')).toBe(true);
    expect(schema.tables.has('posts')).toBe(true);
    expect(schema.tables.has('comments')).toBe(true);
  });
});
