import * as fs from 'fs';
import * as path from 'path';
import { MigrationGenerator } from '../src/generator';

describe('Import Generator Unit Tests', () => {
  let testDir: string;
  let drizzleKitDir: string;
  let migrationsDir: string;

  beforeEach(() => {
    const testId = Math.random().toString(36).substring(7);
    testDir = path.join(__dirname, `test-import-unit-${testId}`);
    drizzleKitDir = path.join(testDir, 'drizzle');
    migrationsDir = path.join(testDir, 'migrations');

    fs.mkdirSync(drizzleKitDir, { recursive: true });
    fs.mkdirSync(path.join(drizzleKitDir, 'meta'), { recursive: true });
    fs.mkdirSync(migrationsDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('parseDrizzleKitSQL', () => {
    test('should parse SQL without breakpoints', async () => {
      const generator = new MigrationGenerator(migrationsDir, undefined, 'mysql');

      const journal = {
        version: '7',
        dialect: 'mysql',
        entries: [
          { idx: 0, version: '5', when: 1700000000000, tag: '0000_test', breakpoints: true },
        ],
      };
      fs.writeFileSync(
        path.join(drizzleKitDir, 'meta', '_journal.json'),
        JSON.stringify(journal, null, 2)
      );

      const sqlContent = `CREATE TABLE users (id INT PRIMARY KEY);`;
      fs.writeFileSync(path.join(drizzleKitDir, '0000_test.sql'), sqlContent);

      const result = await generator.importFromDrizzleKit(drizzleKitDir);

      expect(result.imported.length).toBe(1);

      const content = fs.readFileSync(path.join(migrationsDir, '1700000000000_test.ts'), 'utf-8');
      expect(content).toContain('CREATE TABLE users');
    });

    test('should parse SQL with statement breakpoints', async () => {
      const generator = new MigrationGenerator(migrationsDir, undefined, 'mysql');

      const journal = {
        version: '7',
        dialect: 'mysql',
        entries: [
          { idx: 0, version: '5', when: 1700000000000, tag: '0000_test', breakpoints: true },
        ],
      };
      fs.writeFileSync(
        path.join(drizzleKitDir, 'meta', '_journal.json'),
        JSON.stringify(journal, null, 2)
      );

      const sqlContent = `CREATE TABLE users (id INT PRIMARY KEY);
--> statement-breakpoint
CREATE TABLE posts (id INT PRIMARY KEY);
--> statement-breakpoint
CREATE INDEX idx_test ON posts (id);`;
      fs.writeFileSync(path.join(drizzleKitDir, '0000_test.sql'), sqlContent);

      const result = await generator.importFromDrizzleKit(drizzleKitDir);

      expect(result.imported.length).toBe(1);

      const content = fs.readFileSync(path.join(migrationsDir, '1700000000000_test.ts'), 'utf-8');

      // Should have all three statements in up()
      const upMatches = content.match(/await db\.execute\(sql`/g);
      expect(upMatches?.length).toBeGreaterThanOrEqual(3);
    });

    test('should handle case-insensitive breakpoint markers', async () => {
      const generator = new MigrationGenerator(migrationsDir, undefined, 'mysql');

      const journal = {
        version: '7',
        dialect: 'mysql',
        entries: [
          { idx: 0, version: '5', when: 1700000000000, tag: '0000_test', breakpoints: true },
        ],
      };
      fs.writeFileSync(
        path.join(drizzleKitDir, 'meta', '_journal.json'),
        JSON.stringify(journal, null, 2)
      );

      const sqlContent = `CREATE TABLE a (id INT);
--> STATEMENT-BREAKPOINT
CREATE TABLE b (id INT);
--> Statement-Breakpoint
CREATE TABLE c (id INT);`;
      fs.writeFileSync(path.join(drizzleKitDir, '0000_test.sql'), sqlContent);

      const result = await generator.importFromDrizzleKit(drizzleKitDir);

      expect(result.imported.length).toBe(1);

      const content = fs.readFileSync(path.join(migrationsDir, '1700000000000_test.ts'), 'utf-8');

      expect(content).toContain('CREATE TABLE a');
      expect(content).toContain('CREATE TABLE b');
      expect(content).toContain('CREATE TABLE c');
    });
  });

  describe('extractMigrationName', () => {
    test('should extract name from numbered tag', async () => {
      const generator = new MigrationGenerator(migrationsDir, undefined, 'mysql');

      const journal = {
        version: '7',
        dialect: 'mysql',
        entries: [
          {
            idx: 0,
            version: '5',
            when: 1700000000000,
            tag: '0000_initial_setup',
            breakpoints: true,
          },
        ],
      };
      fs.writeFileSync(
        path.join(drizzleKitDir, 'meta', '_journal.json'),
        JSON.stringify(journal, null, 2)
      );
      fs.writeFileSync(
        path.join(drizzleKitDir, '0000_initial_setup.sql'),
        'CREATE TABLE test (id INT);'
      );

      const result = await generator.importFromDrizzleKit(drizzleKitDir);

      expect(result.imported[0].newName).toBe('1700000000000_initial_setup');
    });

    test('should sanitize special characters in name', async () => {
      const generator = new MigrationGenerator(migrationsDir, undefined, 'mysql');

      const journal = {
        version: '7',
        dialect: 'mysql',
        entries: [
          {
            idx: 0,
            version: '5',
            when: 1700000000000,
            tag: '0000_test-with-dashes',
            breakpoints: true,
          },
        ],
      };
      fs.writeFileSync(
        path.join(drizzleKitDir, 'meta', '_journal.json'),
        JSON.stringify(journal, null, 2)
      );
      fs.writeFileSync(
        path.join(drizzleKitDir, '0000_test-with-dashes.sql'),
        'CREATE TABLE test (id INT);'
      );

      const result = await generator.importFromDrizzleKit(drizzleKitDir);

      // Dashes should be converted to underscores
      expect(result.imported[0].newName).toContain('test_with_dashes');
    });
  });

  describe('generateReverseStatements', () => {
    describe('MySQL dialect', () => {
      test('should generate DROP TABLE for CREATE TABLE', async () => {
        const generator = new MigrationGenerator(migrationsDir, undefined, 'mysql');

        const journal = {
          version: '7',
          dialect: 'mysql',
          entries: [
            { idx: 0, version: '5', when: 1700000000000, tag: '0000_test', breakpoints: true },
          ],
        };
        fs.writeFileSync(
          path.join(drizzleKitDir, 'meta', '_journal.json'),
          JSON.stringify(journal, null, 2)
        );
        fs.writeFileSync(
          path.join(drizzleKitDir, '0000_test.sql'),
          'CREATE TABLE `users` (`id` INT PRIMARY KEY);'
        );

        await generator.importFromDrizzleKit(drizzleKitDir);

        const content = fs.readFileSync(path.join(migrationsDir, '1700000000000_test.ts'), 'utf-8');

        // Backticks are escaped in template literals
        expect(content).toContain('DROP TABLE IF EXISTS \\`users\\`');
      });

      test('should generate DROP FOREIGN KEY for ADD CONSTRAINT FOREIGN KEY', async () => {
        const generator = new MigrationGenerator(migrationsDir, undefined, 'mysql');

        const journal = {
          version: '7',
          dialect: 'mysql',
          entries: [
            { idx: 0, version: '5', when: 1700000000000, tag: '0000_test', breakpoints: true },
          ],
        };
        fs.writeFileSync(
          path.join(drizzleKitDir, 'meta', '_journal.json'),
          JSON.stringify(journal, null, 2)
        );
        fs.writeFileSync(
          path.join(drizzleKitDir, '0000_test.sql'),
          'ALTER TABLE `posts` ADD CONSTRAINT `posts_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`);'
        );

        await generator.importFromDrizzleKit(drizzleKitDir);

        const content = fs.readFileSync(path.join(migrationsDir, '1700000000000_test.ts'), 'utf-8');

        // Backticks are escaped
        expect(content).toContain('DROP FOREIGN KEY \\`posts_user_fk\\`');
      });

      test('should generate DROP INDEX ON table for CREATE INDEX', async () => {
        const generator = new MigrationGenerator(migrationsDir, undefined, 'mysql');

        const journal = {
          version: '7',
          dialect: 'mysql',
          entries: [
            { idx: 0, version: '5', when: 1700000000000, tag: '0000_test', breakpoints: true },
          ],
        };
        fs.writeFileSync(
          path.join(drizzleKitDir, 'meta', '_journal.json'),
          JSON.stringify(journal, null, 2)
        );
        fs.writeFileSync(
          path.join(drizzleKitDir, '0000_test.sql'),
          'CREATE INDEX `idx_users_email` ON `users` (`email`);'
        );

        await generator.importFromDrizzleKit(drizzleKitDir);

        const content = fs.readFileSync(path.join(migrationsDir, '1700000000000_test.ts'), 'utf-8');

        // Backticks are escaped
        expect(content).toContain('DROP INDEX \\`idx_users_email\\` ON \\`users\\`');
      });

      test('should order down statements correctly: FK -> Index -> Table', async () => {
        const generator = new MigrationGenerator(migrationsDir, undefined, 'mysql');

        const journal = {
          version: '7',
          dialect: 'mysql',
          entries: [
            { idx: 0, version: '5', when: 1700000000000, tag: '0000_test', breakpoints: true },
          ],
        };
        fs.writeFileSync(
          path.join(drizzleKitDir, 'meta', '_journal.json'),
          JSON.stringify(journal, null, 2)
        );

        const sqlContent = `CREATE TABLE \`users\` (\`id\` INT PRIMARY KEY);
--> statement-breakpoint
CREATE TABLE \`posts\` (\`id\` INT PRIMARY KEY, \`user_id\` INT);
--> statement-breakpoint
ALTER TABLE \`posts\` ADD CONSTRAINT \`posts_user_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`);
--> statement-breakpoint
CREATE INDEX \`idx_posts_user\` ON \`posts\` (\`user_id\`);`;

        fs.writeFileSync(path.join(drizzleKitDir, '0000_test.sql'), sqlContent);

        await generator.importFromDrizzleKit(drizzleKitDir);

        const content = fs.readFileSync(path.join(migrationsDir, '1700000000000_test.ts'), 'utf-8');

        const downSection = content.split('export async function down')[1];

        const fkIndex = downSection.indexOf('DROP FOREIGN KEY');
        const indexIndex = downSection.indexOf('DROP INDEX');
        const tableIndex = downSection.indexOf('DROP TABLE');

        // FK should come before Index
        expect(fkIndex).toBeLessThan(indexIndex);
        // Index should come before Table
        expect(indexIndex).toBeLessThan(tableIndex);
      });
    });

    describe('PostgreSQL dialect', () => {
      test('should generate DROP TABLE for CREATE TABLE', async () => {
        const generator = new MigrationGenerator(migrationsDir, undefined, 'postgresql');

        const journal = {
          version: '7',
          dialect: 'postgresql',
          entries: [
            { idx: 0, version: '5', when: 1700000000000, tag: '0000_test', breakpoints: true },
          ],
        };
        fs.writeFileSync(
          path.join(drizzleKitDir, 'meta', '_journal.json'),
          JSON.stringify(journal, null, 2)
        );
        fs.writeFileSync(
          path.join(drizzleKitDir, '0000_test.sql'),
          'CREATE TABLE "users" ("id" serial PRIMARY KEY);'
        );

        await generator.importFromDrizzleKit(drizzleKitDir);

        const content = fs.readFileSync(path.join(migrationsDir, '1700000000000_test.ts'), 'utf-8');

        expect(content).toContain('DROP TABLE IF EXISTS "users"');
      });

      test('should generate DROP CONSTRAINT for ADD CONSTRAINT', async () => {
        const generator = new MigrationGenerator(migrationsDir, undefined, 'postgresql');

        const journal = {
          version: '7',
          dialect: 'postgresql',
          entries: [
            { idx: 0, version: '5', when: 1700000000000, tag: '0000_test', breakpoints: true },
          ],
        };
        fs.writeFileSync(
          path.join(drizzleKitDir, 'meta', '_journal.json'),
          JSON.stringify(journal, null, 2)
        );
        fs.writeFileSync(
          path.join(drizzleKitDir, '0000_test.sql'),
          'ALTER TABLE "posts" ADD CONSTRAINT "posts_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id");'
        );

        await generator.importFromDrizzleKit(drizzleKitDir);

        const content = fs.readFileSync(path.join(migrationsDir, '1700000000000_test.ts'), 'utf-8');

        expect(content).toContain('DROP CONSTRAINT "posts_user_fk"');
      });

      test('should generate DROP INDEX IF EXISTS for CREATE INDEX', async () => {
        const generator = new MigrationGenerator(migrationsDir, undefined, 'postgresql');

        const journal = {
          version: '7',
          dialect: 'postgresql',
          entries: [
            { idx: 0, version: '5', when: 1700000000000, tag: '0000_test', breakpoints: true },
          ],
        };
        fs.writeFileSync(
          path.join(drizzleKitDir, 'meta', '_journal.json'),
          JSON.stringify(journal, null, 2)
        );
        fs.writeFileSync(
          path.join(drizzleKitDir, '0000_test.sql'),
          'CREATE INDEX "idx_users_email" ON "users" ("email");'
        );

        await generator.importFromDrizzleKit(drizzleKitDir);

        const content = fs.readFileSync(path.join(migrationsDir, '1700000000000_test.ts'), 'utf-8');
        const downSection = content.split('export async function down')[1];

        expect(downSection).toContain('DROP INDEX IF EXISTS "idx_users_email"');
        // PostgreSQL DROP INDEX doesn't need ON table_name
        expect(downSection).not.toMatch(/DROP INDEX.*ON "users"/);
      });
    });
  });

  describe('Output format', () => {
    test('should generate TypeScript by default', async () => {
      const generator = new MigrationGenerator(migrationsDir, undefined, 'mysql');

      const journal = {
        version: '7',
        dialect: 'mysql',
        entries: [
          { idx: 0, version: '5', when: 1700000000000, tag: '0000_test', breakpoints: true },
        ],
      };
      fs.writeFileSync(
        path.join(drizzleKitDir, 'meta', '_journal.json'),
        JSON.stringify(journal, null, 2)
      );
      fs.writeFileSync(path.join(drizzleKitDir, '0000_test.sql'), 'CREATE TABLE test (id INT);');

      const result = await generator.importFromDrizzleKit(drizzleKitDir);

      expect(result.imported[0].path.endsWith('.ts')).toBe(true);

      const content = fs.readFileSync(result.imported[0].path, 'utf-8');
      expect(content).toContain('import { type MigrationContext }');
      expect(content).toContain(': MigrationContext');
      expect(content).toContain(': Promise<void>');
      expect(content).toContain('export default { up, down }');
    });

    test('should generate JavaScript when requested', async () => {
      const generator = new MigrationGenerator(migrationsDir, undefined, 'mysql');

      const journal = {
        version: '7',
        dialect: 'mysql',
        entries: [
          { idx: 0, version: '5', when: 1700000000000, tag: '0000_test', breakpoints: true },
        ],
      };
      fs.writeFileSync(
        path.join(drizzleKitDir, 'meta', '_journal.json'),
        JSON.stringify(journal, null, 2)
      );
      fs.writeFileSync(path.join(drizzleKitDir, '0000_test.sql'), 'CREATE TABLE test (id INT);');

      const result = await generator.importFromDrizzleKit(drizzleKitDir, { outputFormat: 'js' });

      expect(result.imported[0].path.endsWith('.js')).toBe(true);

      const content = fs.readFileSync(result.imported[0].path, 'utf-8');
      // Should not have ES6 import statement
      expect(content).not.toMatch(/^import\s/m);
      expect(content).not.toContain('MigrationContext');
      expect(content).toContain('async function up({ db, sql })');
      expect(content).toContain('async function down({ db, sql })');
      expect(content).toContain('module.exports = { up, down }');
    });
  });

  describe('Error handling', () => {
    test('should return empty result for empty journal', async () => {
      const generator = new MigrationGenerator(migrationsDir, undefined, 'mysql');

      const journal = {
        version: '7',
        dialect: 'mysql',
        entries: [],
      };
      fs.writeFileSync(
        path.join(drizzleKitDir, 'meta', '_journal.json'),
        JSON.stringify(journal, null, 2)
      );

      const result = await generator.importFromDrizzleKit(drizzleKitDir);

      expect(result.imported.length).toBe(0);
      expect(result.skipped.length).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    test('should handle SQL with special characters', async () => {
      const generator = new MigrationGenerator(migrationsDir, undefined, 'mysql');

      const journal = {
        version: '7',
        dialect: 'mysql',
        entries: [
          { idx: 0, version: '5', when: 1700000000000, tag: '0000_test', breakpoints: true },
        ],
      };
      fs.writeFileSync(
        path.join(drizzleKitDir, 'meta', '_journal.json'),
        JSON.stringify(journal, null, 2)
      );

      // SQL with backticks and dollar signs
      const sqlContent = `CREATE TABLE \`test\` (\`price\` DECIMAL(10,2) DEFAULT 0.00);`;
      fs.writeFileSync(path.join(drizzleKitDir, '0000_test.sql'), sqlContent);

      const result = await generator.importFromDrizzleKit(drizzleKitDir);

      expect(result.imported.length).toBe(1);

      const content = fs.readFileSync(result.imported[0].path, 'utf-8');
      // Backticks should be escaped
      expect(content).toContain('\\`test\\`');
    });
  });
});
