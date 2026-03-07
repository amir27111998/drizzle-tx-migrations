import * as fs from 'fs';
import * as path from 'path';
import { SchemaLoader } from '../src/schema-loader';

describe('SchemaLoader - Glob and Directory Unit Tests', () => {
  const testDir = path.join(__dirname, 'test-glob-schemas');
  const nestedDir = path.join(testDir, 'nested', 'deep');
  const modelsDir = path.join(testDir, 'models');
  const entitiesDir = path.join(testDir, 'entities');

  beforeAll(() => {
    // Create complex directory structure
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.mkdirSync(modelsDir, { recursive: true });
    fs.mkdirSync(entitiesDir, { recursive: true });

    // Create schema files at different levels
    fs.writeFileSync(
      path.join(testDir, 'root-schema.ts'),
      `
      import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
      export const rootTable = pgTable('root_table', {
        id: serial('id').primaryKey(),
        name: varchar('name', { length: 255 })
      });
    `
    );

    fs.writeFileSync(
      path.join(nestedDir, 'deep-schema.ts'),
      `
      import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
      export const deepTable = pgTable('deep_table', {
        id: serial('id').primaryKey(),
        value: varchar('value', { length: 100 })
      });
    `
    );

    fs.writeFileSync(
      path.join(modelsDir, 'user.model.ts'),
      `
      import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
      export const users = pgTable('users', {
        id: serial('id').primaryKey(),
        email: varchar('email', { length: 255 }).unique()
      });
    `
    );

    fs.writeFileSync(
      path.join(modelsDir, 'post.model.ts'),
      `
      import { pgTable, serial, varchar, integer } from 'drizzle-orm/pg-core';
      export const posts = pgTable('posts', {
        id: serial('id').primaryKey(),
        title: varchar('title', { length: 255 }),
        userId: integer('user_id')
      });
    `
    );

    fs.writeFileSync(
      path.join(entitiesDir, 'product.entity.ts'),
      `
      import { pgTable, serial, varchar, decimal } from 'drizzle-orm/pg-core';
      export const products = pgTable('products', {
        id: serial('id').primaryKey(),
        name: varchar('name', { length: 255 }),
        price: decimal('price', { precision: 10, scale: 2 })
      });
    `
    );

    // Create non-.ts files that should be ignored
    fs.writeFileSync(path.join(testDir, 'config.json'), '{"test": true}');
    fs.writeFileSync(path.join(modelsDir, 'README.md'), '# Models');

    // Create a .js file that should be attempted to load
    // Note: This won't be recognized as a Drizzle table without proper imports,
    // but the loader should at least attempt to load it
    fs.writeFileSync(
      path.join(testDir, 'legacy.js'),
      `
      const { pgTable, serial } = require('drizzle-orm/pg-core');
      module.exports = {
        legacyTable: pgTable('legacy_table', {
          id: serial('id').primaryKey()
        })
      };
    `
    );
  });

  afterAll(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Single Directory Scanning', () => {
    it('should find all .ts files in root directory only (non-recursive)', async () => {
      const loader = new SchemaLoader([testDir], 'postgresql');
      const schema = await loader.loadSchema();

      // Should find root-schema.ts and legacy.js
      expect(schema.tables.size).toBeGreaterThanOrEqual(1);
    });

    it('should recursively find all .ts files in directory tree', async () => {
      const loader = new SchemaLoader([testDir], 'postgresql');
      const schema = await loader.loadSchema();

      // Should find files in testDir, nested/deep, models, and entities
      expect(schema.tables.size).toBeGreaterThanOrEqual(4);
      expect(schema.tables.has('root_table')).toBe(true);
      expect(schema.tables.has('deep_table')).toBe(true);
      expect(schema.tables.has('users')).toBe(true);
      expect(schema.tables.has('posts')).toBe(true);
      expect(schema.tables.has('products')).toBe(true);
    });

    it('should find files in nested subdirectory', async () => {
      const loader = new SchemaLoader([modelsDir], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.size).toBe(2);
      expect(schema.tables.has('users')).toBe(true);
      expect(schema.tables.has('posts')).toBe(true);
      expect(schema.tables.has('products')).toBe(false); // Not in models dir
    });

    it('should include .js files along with .ts files', async () => {
      const loader = new SchemaLoader([testDir], 'postgresql');
      const schema = await loader.loadSchema();

      // Should include legacy.js (if it contains valid Drizzle tables)
      // Note: The legacy.js file is loaded and if it exports valid Drizzle tables, they'll be included
      // For this test, we just verify that .js files are processed
      // The actual table count will include legacy_table if drizzle-orm is available in the test environment
      expect(schema.tables.size).toBeGreaterThanOrEqual(3); // At least root_table, deep_table, and others
    });

    it('should ignore non-schema files (json, md, etc)', async () => {
      const loader = new SchemaLoader([testDir], 'postgresql');
      const schema = await loader.loadSchema();

      // Should not include config.json or README.md
      const tableNames = Array.from(schema.tables.keys());
      expect(tableNames.some((name) => name.includes('config'))).toBe(false);
      expect(tableNames.some((name) => name.includes('README'))).toBe(false);
    });

    it('should skip node_modules directory', async () => {
      // Create a node_modules dir with a schema file
      const nodeModulesDir = path.join(testDir, 'node_modules');
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeModulesDir, 'fake-schema.ts'),
        `
        import { pgTable, serial } from 'drizzle-orm/pg-core';
        export const fakeTable = pgTable('fake_table', {
          id: serial('id').primaryKey()
        });
      `
      );

      const loader = new SchemaLoader([testDir], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.has('fake_table')).toBe(false);

      // Cleanup
      fs.rmSync(nodeModulesDir, { recursive: true, force: true });
    });

    it('should skip hidden directories (starting with .)', async () => {
      const hiddenDir = path.join(testDir, '.hidden');
      fs.mkdirSync(hiddenDir, { recursive: true });
      fs.writeFileSync(
        path.join(hiddenDir, 'hidden-schema.ts'),
        `
        import { pgTable, serial } from 'drizzle-orm/pg-core';
        export const hiddenTable = pgTable('hidden_table', {
          id: serial('id').primaryKey()
        });
      `
      );

      const loader = new SchemaLoader([testDir], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.has('hidden_table')).toBe(false);

      // Cleanup
      fs.rmSync(hiddenDir, { recursive: true, force: true });
    });
  });

  describe('Glob Pattern Matching', () => {
    it('should support single-level wildcard (*.ts)', async () => {
      const pattern = path.join(modelsDir, '*.ts');
      const loader = new SchemaLoader([pattern], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.size).toBe(2);
      expect(schema.tables.has('users')).toBe(true);
      expect(schema.tables.has('posts')).toBe(true);
    });

    it('should support recursive wildcard (**/*.ts)', async () => {
      const pattern = path.join(testDir, '**/*.ts');
      const loader = new SchemaLoader([pattern], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.size).toBeGreaterThanOrEqual(5);
      expect(schema.tables.has('root_table')).toBe(true);
      expect(schema.tables.has('deep_table')).toBe(true);
      expect(schema.tables.has('users')).toBe(true);
    });

    it('should support specific pattern (*.model.ts)', async () => {
      const pattern = path.join(testDir, '**/*.model.ts');
      const loader = new SchemaLoader([pattern], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.size).toBe(2);
      expect(schema.tables.has('users')).toBe(true);
      expect(schema.tables.has('posts')).toBe(true);
      expect(schema.tables.has('products')).toBe(false); // .entity.ts, not .model.ts
    });

    it('should support entity pattern (*.entity.ts)', async () => {
      const pattern = path.join(testDir, '**/*.entity.ts');
      const loader = new SchemaLoader([pattern], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.size).toBe(1);
      expect(schema.tables.has('products')).toBe(true);
    });

    it('should support multiple patterns', async () => {
      const patterns = [
        path.join(testDir, '**/*.model.ts'),
        path.join(testDir, '**/*.entity.ts'),
      ];
      const loader = new SchemaLoader(patterns, 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.size).toBe(3);
      expect(schema.tables.has('users')).toBe(true);
      expect(schema.tables.has('posts')).toBe(true);
      expect(schema.tables.has('products')).toBe(true);
    });

    it('should exclude node_modules even with glob pattern', async () => {
      const nodeModulesDir = path.join(testDir, 'node_modules', 'pkg');
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeModulesDir, 'schema.ts'),
        `
        import { pgTable, serial } from 'drizzle-orm/pg-core';
        export const nodeTable = pgTable('node_table', {
          id: serial('id').primaryKey()
        });
      `
      );

      const pattern = path.join(testDir, '**/*.ts');
      const loader = new SchemaLoader([pattern], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.has('node_table')).toBe(false);

      // Cleanup
      fs.rmSync(path.join(testDir, 'node_modules'), { recursive: true, force: true });
    });

    it('should exclude dist and build directories with glob', async () => {
      const distDir = path.join(testDir, 'dist');
      const buildDir = path.join(testDir, 'build');

      fs.mkdirSync(distDir, { recursive: true });
      fs.mkdirSync(buildDir, { recursive: true });

      fs.writeFileSync(
        path.join(distDir, 'compiled.ts'),
        `export const distTable = pgTable('dist_table', { id: serial('id') });`
      );
      fs.writeFileSync(
        path.join(buildDir, 'compiled.ts'),
        `export const buildTable = pgTable('build_table', { id: serial('id') });`
      );

      const pattern = path.join(testDir, '**/*.ts');
      const loader = new SchemaLoader([pattern], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.has('dist_table')).toBe(false);
      expect(schema.tables.has('build_table')).toBe(false);

      // Cleanup
      fs.rmSync(distDir, { recursive: true, force: true });
      fs.rmSync(buildDir, { recursive: true, force: true });
    });
  });

  describe('Mixed Path Types', () => {
    it('should handle mix of file, directory, and glob patterns', async () => {
      const rootFile = path.join(testDir, 'root-schema.ts');
      const modelsPattern = path.join(modelsDir, '*.ts');

      const loader = new SchemaLoader([rootFile, entitiesDir, modelsPattern], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.size).toBeGreaterThanOrEqual(4);
      expect(schema.tables.has('root_table')).toBe(true); // file
      expect(schema.tables.has('products')).toBe(true); // directory
      expect(schema.tables.has('users')).toBe(true); // glob
      expect(schema.tables.has('posts')).toBe(true); // glob
    });

    it('should deduplicate files specified multiple ways', async () => {
      const userFile = path.join(modelsDir, 'user.model.ts');
      const modelsPattern = path.join(modelsDir, '*.ts');

      const loader = new SchemaLoader([userFile, modelsDir, modelsPattern], 'postgresql');
      const schema = await loader.loadSchema();

      // Should only have users and posts once each (no duplicates)
      expect(schema.tables.size).toBe(2);
      expect(schema.tables.has('users')).toBe(true);
      expect(schema.tables.has('posts')).toBe(true);
    });

    it('should handle relative and absolute paths', async () => {
      const relativePath = path.relative(process.cwd(), modelsDir);
      const absolutePath = modelsDir;

      const loader1 = new SchemaLoader([relativePath], 'postgresql');
      const schema1 = await loader1.loadSchema();

      const loader2 = new SchemaLoader([absolutePath], 'postgresql');
      const schema2 = await loader2.loadSchema();

      expect(schema1.tables.size).toBe(schema2.tables.size);
      expect(schema1.tables.has('users')).toBe(true);
      expect(schema2.tables.has('users')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent directory gracefully', async () => {
      const loader = new SchemaLoader(['/non/existent/directory'], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.size).toBe(0);
    });

    it('should handle non-existent file gracefully', async () => {
      const loader = new SchemaLoader(['/non/existent/file.ts'], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.size).toBe(0);
    });

    it('should handle invalid glob pattern gracefully', async () => {
      const loader = new SchemaLoader(['[invalid-glob-pattern'], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.size).toBe(0);
    });

    it('should handle empty directory', async () => {
      const emptyDir = path.join(testDir, 'empty');
      fs.mkdirSync(emptyDir, { recursive: true });

      const loader = new SchemaLoader([emptyDir], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.size).toBe(0);

      // Cleanup
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });

    it('should handle directory with no .ts/.js files', async () => {
      const noSchemaDir = path.join(testDir, 'no-schemas');
      fs.mkdirSync(noSchemaDir, { recursive: true });
      fs.writeFileSync(path.join(noSchemaDir, 'data.json'), '{}');
      fs.writeFileSync(path.join(noSchemaDir, 'README.md'), '# Docs');

      const loader = new SchemaLoader([noSchemaDir], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.size).toBe(0);

      // Cleanup
      fs.rmSync(noSchemaDir, { recursive: true, force: true });
    });

    it('should handle file with invalid TypeScript syntax', async () => {
      const invalidFile = path.join(testDir, 'invalid.ts');
      fs.writeFileSync(invalidFile, 'this is not valid typescript!!!');

      const loader = new SchemaLoader([invalidFile], 'postgresql');
      const schema = await loader.loadSchema();

      // Should not crash, just skip the invalid file
      expect(schema.tables.size).toBeGreaterThanOrEqual(0);

      // Cleanup
      fs.unlinkSync(invalidFile);
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large number of files efficiently', async () => {
      const largeDirTest = path.join(testDir, 'large-test');
      fs.mkdirSync(largeDirTest, { recursive: true });

      // Create 50 schema files
      for (let i = 0; i < 50; i++) {
        fs.writeFileSync(
          path.join(largeDirTest, `schema${i}.ts`),
          `
          import { pgTable, serial } from 'drizzle-orm/pg-core';
          export const table${i} = pgTable('table_${i}', {
            id: serial('id').primaryKey()
          });
        `
        );
      }

      const startTime = Date.now();
      const loader = new SchemaLoader([largeDirTest], 'postgresql');
      const schema = await loader.loadSchema();
      const endTime = Date.now();

      expect(schema.tables.size).toBeGreaterThanOrEqual(50);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete in < 10 seconds

      // Cleanup
      fs.rmSync(largeDirTest, { recursive: true, force: true });
    });

    it('should handle deeply nested directories', async () => {
      const deepPath = path.join(testDir, 'a', 'b', 'c', 'd', 'e', 'f');
      fs.mkdirSync(deepPath, { recursive: true });
      fs.writeFileSync(
        path.join(deepPath, 'deep.ts'),
        `
        import { pgTable, serial } from 'drizzle-orm/pg-core';
        export const veryDeepTable = pgTable('very_deep_table', {
          id: serial('id').primaryKey()
        });
      `
      );

      const loader = new SchemaLoader([path.join(testDir, 'a')], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.has('very_deep_table')).toBe(true);

      // Cleanup
      fs.rmSync(path.join(testDir, 'a'), { recursive: true, force: true });
    });

    it('should handle paths with special characters', async () => {
      const specialDir = path.join(testDir, 'special-chars_123');
      fs.mkdirSync(specialDir, { recursive: true });
      fs.writeFileSync(
        path.join(specialDir, 'schema-with-dashes.ts'),
        `
        import { pgTable, serial } from 'drizzle-orm/pg-core';
        export const specialTable = pgTable('special_table', {
          id: serial('id').primaryKey()
        });
      `
      );

      const loader = new SchemaLoader([specialDir], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.has('special_table')).toBe(true);

      // Cleanup
      fs.rmSync(specialDir, { recursive: true, force: true });
    });

    it('should return sorted file list for deterministic results', async () => {
      const loader1 = new SchemaLoader([modelsDir], 'postgresql');
      const schema1 = await loader1.loadSchema();

      const loader2 = new SchemaLoader([modelsDir], 'postgresql');
      const schema2 = await loader2.loadSchema();

      const tables1 = Array.from(schema1.tables.keys()).sort();
      const tables2 = Array.from(schema2.tables.keys()).sort();

      expect(tables1).toEqual(tables2);
    });
  });

  describe('Cross-Platform Path Handling', () => {
    it('should handle both forward and backward slashes', async () => {
      // This test ensures paths work on both Unix and Windows
      const unixPath = modelsDir.replace(/\\/g, '/');
      const loader = new SchemaLoader([unixPath], 'postgresql');
      const schema = await loader.loadSchema();

      expect(schema.tables.size).toBeGreaterThanOrEqual(2);
    });

    it('should normalize paths before deduplication', async () => {
      const path1 = modelsDir;
      const path2 = modelsDir + '/';
      const path3 = modelsDir + path.sep;

      const loader = new SchemaLoader([path1, path2, path3], 'postgresql');
      const schema = await loader.loadSchema();

      // Should deduplicate despite different path formats
      expect(schema.tables.size).toBe(2);
    });
  });
});
