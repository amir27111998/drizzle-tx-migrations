import * as fs from 'fs';
import * as path from 'path';
import { MigrationGenerator } from '../../src/generator';

describe('Import from Drizzle-Kit Integration Tests', () => {
  let testDir: string;
  let drizzleKitDir: string;
  let migrationsDir: string;
  let generator: MigrationGenerator;

  beforeEach(() => {
    const testId = Math.random().toString(36).substring(7);
    testDir = path.join(__dirname, `../test-import-${testId}`);
    drizzleKitDir = path.join(testDir, 'drizzle');
    migrationsDir = path.join(testDir, 'migrations');

    // Create directories
    fs.mkdirSync(drizzleKitDir, { recursive: true });
    fs.mkdirSync(path.join(drizzleKitDir, 'meta'), { recursive: true });
    fs.mkdirSync(migrationsDir, { recursive: true });

    generator = new MigrationGenerator(migrationsDir, undefined, 'mysql');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should import single drizzle-kit migration', async () => {
    // Create drizzle-kit journal
    const journal = {
      version: '7',
      dialect: 'mysql',
      entries: [
        {
          idx: 0,
          version: '5',
          when: 1700000000000,
          tag: '0000_initial',
          breakpoints: true,
        },
      ],
    };
    fs.writeFileSync(
      path.join(drizzleKitDir, 'meta', '_journal.json'),
      JSON.stringify(journal, null, 2)
    );

    // Create SQL migration file
    const sqlContent = `CREATE TABLE \`users\` (
	\`id\` int AUTO_INCREMENT NOT NULL,
	\`email\` varchar(255) NOT NULL,
	CONSTRAINT \`users_id\` PRIMARY KEY(\`id\`)
);`;
    fs.writeFileSync(path.join(drizzleKitDir, '0000_initial.sql'), sqlContent);

    // Import
    const result = await generator.importFromDrizzleKit(drizzleKitDir);

    expect(result.imported.length).toBe(1);
    expect(result.skipped.length).toBe(0);
    expect(result.errors.length).toBe(0);
    expect(result.imported[0].originalName).toBe('0000_initial');
    expect(result.imported[0].newName).toBe('1700000000000_initial');

    // Verify file was created
    const files = fs.readdirSync(migrationsDir);
    expect(files.length).toBe(1);
    expect(files[0]).toBe('1700000000000_initial.ts');

    // Verify content
    const content = fs.readFileSync(path.join(migrationsDir, files[0]), 'utf-8');
    expect(content).toContain('export async function up');
    expect(content).toContain('export async function down');
    expect(content).toContain('CREATE TABLE');
    expect(content).toContain('DROP TABLE IF EXISTS');
  });

  test('should import multiple drizzle-kit migrations in order', async () => {
    // Create journal with multiple entries
    const journal = {
      version: '7',
      dialect: 'mysql',
      entries: [
        { idx: 0, version: '5', when: 1700000000000, tag: '0000_create_users', breakpoints: true },
        { idx: 1, version: '5', when: 1700000001000, tag: '0001_create_posts', breakpoints: true },
        { idx: 2, version: '5', when: 1700000002000, tag: '0002_add_index', breakpoints: true },
      ],
    };
    fs.writeFileSync(
      path.join(drizzleKitDir, 'meta', '_journal.json'),
      JSON.stringify(journal, null, 2)
    );

    // Create SQL files
    fs.writeFileSync(
      path.join(drizzleKitDir, '0000_create_users.sql'),
      `CREATE TABLE \`users\` (\`id\` int PRIMARY KEY);`
    );
    fs.writeFileSync(
      path.join(drizzleKitDir, '0001_create_posts.sql'),
      `CREATE TABLE \`posts\` (\`id\` int PRIMARY KEY);`
    );
    fs.writeFileSync(
      path.join(drizzleKitDir, '0002_add_index.sql'),
      `CREATE INDEX \`idx_posts_id\` ON \`posts\` (\`id\`);`
    );

    const result = await generator.importFromDrizzleKit(drizzleKitDir);

    expect(result.imported.length).toBe(3);
    expect(result.errors.length).toBe(0);

    // Verify files
    const files = fs.readdirSync(migrationsDir).sort();
    expect(files.length).toBe(3);
    expect(files[0]).toContain('create_users');
    expect(files[1]).toContain('create_posts');
    expect(files[2]).toContain('add_index');
  });

  test('should skip already imported migrations', async () => {
    // Create journal
    const journal = {
      version: '7',
      dialect: 'mysql',
      entries: [
        { idx: 0, version: '5', when: 1700000000000, tag: '0000_initial', breakpoints: true },
      ],
    };
    fs.writeFileSync(
      path.join(drizzleKitDir, 'meta', '_journal.json'),
      JSON.stringify(journal, null, 2)
    );
    fs.writeFileSync(
      path.join(drizzleKitDir, '0000_initial.sql'),
      `CREATE TABLE \`users\` (\`id\` int PRIMARY KEY);`
    );

    // Create existing migration file
    fs.writeFileSync(path.join(migrationsDir, '1699999999999_initial.ts'), '// existing');

    const result = await generator.importFromDrizzleKit(drizzleKitDir);

    expect(result.imported.length).toBe(0);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].reason).toBe('already exists');
  });

  test('should parse statement breakpoints correctly', async () => {
    const journal = {
      version: '7',
      dialect: 'mysql',
      entries: [
        { idx: 0, version: '5', when: 1700000000000, tag: '0000_complex', breakpoints: true },
      ],
    };
    fs.writeFileSync(
      path.join(drizzleKitDir, 'meta', '_journal.json'),
      JSON.stringify(journal, null, 2)
    );

    // Create SQL with statement breakpoints
    const sqlContent = `CREATE TABLE \`users\` (
	\`id\` int PRIMARY KEY
);
--> statement-breakpoint
CREATE TABLE \`posts\` (
	\`id\` int PRIMARY KEY
);
--> statement-breakpoint
ALTER TABLE \`posts\` ADD CONSTRAINT \`posts_user_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`);`;

    fs.writeFileSync(path.join(drizzleKitDir, '0000_complex.sql'), sqlContent);

    const result = await generator.importFromDrizzleKit(drizzleKitDir);

    expect(result.imported.length).toBe(1);

    // Verify content has all statements
    const content = fs.readFileSync(path.join(migrationsDir, '1700000000000_complex.ts'), 'utf-8');
    expect(content).toContain('CREATE TABLE');
    expect(content).toContain('ALTER TABLE');
    expect(content).toContain('ADD CONSTRAINT');
  });

  test('should generate correct down migration for MySQL', async () => {
    const journal = {
      version: '7',
      dialect: 'mysql',
      entries: [{ idx: 0, version: '5', when: 1700000000000, tag: '0000_full', breakpoints: true }],
    };
    fs.writeFileSync(
      path.join(drizzleKitDir, 'meta', '_journal.json'),
      JSON.stringify(journal, null, 2)
    );

    const sqlContent = `CREATE TABLE \`users\` (\`id\` int PRIMARY KEY);
--> statement-breakpoint
CREATE TABLE \`posts\` (\`id\` int PRIMARY KEY, \`user_id\` int);
--> statement-breakpoint
ALTER TABLE \`posts\` ADD CONSTRAINT \`posts_user_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`);
--> statement-breakpoint
CREATE INDEX \`idx_posts_user\` ON \`posts\` (\`user_id\`);`;

    fs.writeFileSync(path.join(drizzleKitDir, '0000_full.sql'), sqlContent);

    const result = await generator.importFromDrizzleKit(drizzleKitDir);
    expect(result.imported.length).toBe(1);

    const content = fs.readFileSync(path.join(migrationsDir, '1700000000000_full.ts'), 'utf-8');

    // Verify down migration order: FK -> Index -> Tables
    const downSection = content.split('export async function down')[1];
    const fkDropIndex = downSection.indexOf('DROP FOREIGN KEY');
    const indexDropIndex = downSection.indexOf('DROP INDEX');
    const tableDropIndex = downSection.indexOf('DROP TABLE');

    expect(fkDropIndex).toBeLessThan(indexDropIndex);
    expect(indexDropIndex).toBeLessThan(tableDropIndex);

    // Verify MySQL-specific syntax (backticks are escaped in template literals)
    expect(downSection).toContain('DROP FOREIGN KEY');
    expect(downSection).toContain('DROP INDEX');
  });

  test('should generate JavaScript output when requested', async () => {
    const journal = {
      version: '7',
      dialect: 'mysql',
      entries: [
        { idx: 0, version: '5', when: 1700000000000, tag: '0000_js_test', breakpoints: true },
      ],
    };
    fs.writeFileSync(
      path.join(drizzleKitDir, 'meta', '_journal.json'),
      JSON.stringify(journal, null, 2)
    );
    fs.writeFileSync(
      path.join(drizzleKitDir, '0000_js_test.sql'),
      `CREATE TABLE \`users\` (\`id\` int PRIMARY KEY);`
    );

    const result = await generator.importFromDrizzleKit(drizzleKitDir, {
      outputFormat: 'js',
    });

    expect(result.imported.length).toBe(1);

    const files = fs.readdirSync(migrationsDir);
    expect(files[0].endsWith('.js')).toBe(true);

    const content = fs.readFileSync(path.join(migrationsDir, files[0]), 'utf-8');
    expect(content).toContain('async function up({ db, sql })');
    expect(content).toContain('module.exports = { up, down }');
    expect(content).not.toContain('MigrationContext');
  });

  test('should handle missing SQL file gracefully', async () => {
    const journal = {
      version: '7',
      dialect: 'mysql',
      entries: [
        { idx: 0, version: '5', when: 1700000000000, tag: '0000_missing', breakpoints: true },
      ],
    };
    fs.writeFileSync(
      path.join(drizzleKitDir, 'meta', '_journal.json'),
      JSON.stringify(journal, null, 2)
    );
    // Don't create the SQL file

    const result = await generator.importFromDrizzleKit(drizzleKitDir);

    expect(result.imported.length).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('SQL file not found');
  });

  test('should throw error for invalid drizzle-kit folder', async () => {
    await expect(generator.importFromDrizzleKit('/nonexistent/path')).rejects.toThrow(
      'Drizzle-kit folder not found'
    );
  });

  test('should throw error for missing journal', async () => {
    // Create folder but no journal
    fs.mkdirSync(path.join(testDir, 'empty-drizzle'), { recursive: true });

    await expect(
      generator.importFromDrizzleKit(path.join(testDir, 'empty-drizzle'))
    ).rejects.toThrow('Drizzle-kit journal not found');
  });

  test('should handle PostgreSQL dialect correctly', async () => {
    const pgGenerator = new MigrationGenerator(migrationsDir, undefined, 'postgresql');

    const journal = {
      version: '7',
      dialect: 'postgresql',
      entries: [
        { idx: 0, version: '5', when: 1700000000000, tag: '0000_pg_test', breakpoints: true },
      ],
    };
    fs.writeFileSync(
      path.join(drizzleKitDir, 'meta', '_journal.json'),
      JSON.stringify(journal, null, 2)
    );

    const sqlContent = `CREATE TABLE "users" ("id" serial PRIMARY KEY);
--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" ("email");`;

    fs.writeFileSync(path.join(drizzleKitDir, '0000_pg_test.sql'), sqlContent);

    const result = await pgGenerator.importFromDrizzleKit(drizzleKitDir);
    expect(result.imported.length).toBe(1);

    const content = fs.readFileSync(path.join(migrationsDir, '1700000000000_pg_test.ts'), 'utf-8');

    // PostgreSQL uses different syntax - check only down section
    const downSection = content.split('export async function down')[1];
    expect(downSection).toContain('DROP INDEX IF EXISTS');
    // PG DROP INDEX doesn't have ON table_name
    expect(downSection).not.toMatch(/DROP INDEX.*ON "users"/);
  });
});
