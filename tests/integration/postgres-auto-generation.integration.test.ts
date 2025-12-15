import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { Migrator } from '../../src/migrator';
import { MigrationGenerator } from '../../src/generator';
import { SchemaIntrospector } from '../../src/schema-introspector';
import { SchemaDiffer } from '../../src/schema-differ';
import { SqlGenerator } from '../../src/sql-generator';
import type { DatabaseSchema } from '../../src/schema-introspector';

describe('PostgreSQL Auto-Generation Integration Tests', () => {
  let masterPool: Pool;
  let pool: Pool;
  let db: any;
  let testDir: string;
  let testDatabase: string;

  beforeAll(async () => {
    masterPool = new Pool({
      host: 'localhost',
      port: 54320,
      user: 'testuser',
      password: 'testpass',
      database: 'postgres',
    });
  });

  afterAll(async () => {
    await masterPool.end();
  });

  beforeEach(async () => {
    const testId = Math.random().toString(36).substring(7);
    testDatabase = `test_db_${testId}`;
    testDir = path.join(__dirname, `../test-migrations-pg-auto-${testId}`);

    await masterPool.query(`CREATE DATABASE ${testDatabase}`);

    pool = new Pool({
      host: 'localhost',
      port: 54320,
      user: 'testuser',
      password: 'testpass',
      database: testDatabase,
    });

    db = drizzle(pool);
    fs.mkdirSync(testDir, { recursive: true });
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

  test('should introspect PostgreSQL database schema', async () => {
    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const introspector = new SchemaIntrospector(db, 'postgresql');
    const schema = await introspector.introspect();

    expect(schema.tables.size).toBe(1);
    expect(schema.tables.has('users')).toBe(true);

    const usersTable = schema.tables.get('users')!;
    expect(usersTable.columns.length).toBeGreaterThanOrEqual(4);
    expect(usersTable.columns.find((c) => c.name === 'email')?.notNull).toBe(true);
    expect(usersTable.columns.find((c) => c.name === 'id')?.primaryKey).toBe(true);
  });

  test('should introspect table with indexes', async () => {
    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        username VARCHAR(100) NOT NULL
      );
      CREATE UNIQUE INDEX idx_email ON users(email);
      CREATE INDEX idx_username ON users(username);
    `);

    const introspector = new SchemaIntrospector(db, 'postgresql');
    const schema = await introspector.introspect();

    const usersTable = schema.tables.get('users')!;
    expect(usersTable.indexes.length).toBeGreaterThanOrEqual(2);

    const emailIndex = usersTable.indexes.find((i) => i.name === 'idx_email');
    expect(emailIndex).toBeDefined();
    expect(emailIndex!.unique).toBe(true);

    const usernameIndex = usersTable.indexes.find((i) => i.name === 'idx_username');
    expect(usernameIndex).toBeDefined();
    expect(usernameIndex!.unique).toBe(false);
  });

  test('should introspect table with foreign keys', async () => {
    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL
      );

      CREATE TABLE posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    const introspector = new SchemaIntrospector(db, 'postgresql');
    const schema = await introspector.introspect();

    const postsTable = schema.tables.get('posts')!;
    expect(postsTable.foreignKeys).toHaveLength(1);
    expect(postsTable.foreignKeys[0].column).toBe('user_id');
    expect(postsTable.foreignKeys[0].referencedTable).toBe('users');
    expect(postsTable.foreignKeys[0].referencedColumn).toBe('id');
    expect(postsTable.foreignKeys[0].onDelete).toBe('CASCADE');
  });

  test('should detect schema differences for new table', async () => {
    const currentSchema: DatabaseSchema = { tables: new Map() };

    const desiredSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'varchar', notNull: true, primaryKey: false },
              { name: 'name', type: 'varchar', notNull: false, primaryKey: false },
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

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('create_table');
    expect(changes[0].table).toBe('users');
  });

  test('should detect column additions', async () => {
    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL
      )
    `);

    const introspector = new SchemaIntrospector(db, 'postgresql');
    const currentSchema = await introspector.introspect();

    const desiredSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'varchar', notNull: true, primaryKey: false },
              { name: 'name', type: 'varchar', notNull: false, primaryKey: false },
              { name: 'age', type: 'integer', notNull: false, primaryKey: false },
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

    expect(changes.length).toBeGreaterThanOrEqual(1);
    const alterTableChange = changes.find((c) => c.type === 'alter_table');
    expect(alterTableChange).toBeDefined();
    expect(alterTableChange!.details.changes.length).toBeGreaterThanOrEqual(2); // at least name and age columns
  });

  test('should generate PostgreSQL-specific SQL', () => {
    const currentSchema: DatabaseSchema = { tables: new Map() };

    const desiredSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'varchar', notNull: true, primaryKey: false },
              { name: 'data', type: 'jsonb', notNull: false, primaryKey: false },
              { name: 'created_at', type: 'timestamptz', notNull: false, primaryKey: false },
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

    const sqlGenerator = new SqlGenerator('postgresql');
    const { upStatements, downStatements } = sqlGenerator.generate(changes);

    expect(upStatements).toHaveLength(1);
    expect(upStatements[0]).toContain('CREATE TABLE "users"');
    expect(upStatements[0]).toContain('SERIAL PRIMARY KEY');
    expect(upStatements[0]).toContain('JSONB');
    expect(upStatements[0]).toContain('TIMESTAMPTZ');

    expect(downStatements).toHaveLength(1);
    expect(downStatements[0]).toContain('DROP TABLE IF EXISTS "users"');
  });

  test('should generate SQL for indexes', () => {
    const currentSchema: DatabaseSchema = { tables: new Map() };

    const desiredSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'varchar', notNull: true, primaryKey: false },
            ],
            indexes: [
              { name: 'idx_users_email', columns: ['email'], unique: true },
            ],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
      ]),
    };

    const differ = new SchemaDiffer(currentSchema, desiredSchema);
    const changes = differ.diff();

    const sqlGenerator = new SqlGenerator('postgresql');
    const { upStatements } = sqlGenerator.generate(changes);

    expect(upStatements.length).toBeGreaterThanOrEqual(2);
    expect(upStatements.some((s) => s.includes('CREATE TABLE'))).toBe(true);
    expect(upStatements.some((s) => s.includes('CREATE UNIQUE INDEX'))).toBe(true);
    expect(upStatements.some((s) => s.includes('idx_users_email'))).toBe(true);
  });

  test('should generate SQL for foreign keys', () => {
    const currentSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'varchar', notNull: true, primaryKey: false },
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
              { name: 'title', type: 'varchar', notNull: true, primaryKey: false },
            ],
            indexes: [],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
      ]),
    };

    const desiredSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'varchar', notNull: true, primaryKey: false },
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
              { name: 'title', type: 'varchar', notNull: true, primaryKey: false },
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

    const differ = new SchemaDiffer(currentSchema, desiredSchema);
    const changes = differ.diff();

    const sqlGenerator = new SqlGenerator('postgresql');
    const { upStatements } = sqlGenerator.generate(changes);

    const fkStatement = upStatements.find((s) => s.includes('FOREIGN KEY'));
    expect(fkStatement).toBeDefined();
    expect(fkStatement).toContain('fk_posts_user');
    expect(fkStatement).toContain('user_id');
    expect(fkStatement).toContain('REFERENCES "users"("id")');
    expect(fkStatement).toContain('ON DELETE CASCADE');
  });

  test('should run generated migrations on PostgreSQL', async () => {
    const generator = new MigrationGenerator(testDir);
    const migrationPath = await generator.generateMigration('create_users');

    const migrationContent = `
import { type MigrationContext } from 'drizzle-tx-migrations';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  \`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS users\`);
}

export default { up, down };
`;
    fs.writeFileSync(migrationPath, migrationContent);

    const migrator = new Migrator({
      db,
      dialect: 'postgresql',
      config: { migrationsFolder: testDir },
    });

    const result = await migrator.runMigrations();
    expect(result.success).toBe(true);
    expect(result.executed.length).toBe(1);

    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    `);
    expect(tablesResult.rows).toHaveLength(1);
  });

  test('should revert migrations on PostgreSQL', async () => {
    const generator = new MigrationGenerator(testDir);
    const migrationPath = await generator.generateMigration('create_users');

    const migrationContent = `
import { type MigrationContext } from 'drizzle-tx-migrations';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS users\`);
}

export default { up, down };
`;
    fs.writeFileSync(migrationPath, migrationContent);

    const migrator = new Migrator({
      db,
      dialect: 'postgresql',
      config: { migrationsFolder: testDir },
    });

    await migrator.runMigrations();

    let tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    `);
    expect(tablesResult.rows).toHaveLength(1);

    const revertResult = await migrator.revertMigration(1);
    expect(revertResult.success).toBe(true);

    tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    `);
    expect(tablesResult.rows).toHaveLength(0);
  });

  test('should handle full auto-generation flow on PostgreSQL', async () => {
    // Create initial table
    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL
      )
    `);

    // Introspect current state
    const introspector = new SchemaIntrospector(db, 'postgresql');
    const currentSchema = await introspector.introspect();

    expect(currentSchema.tables.size).toBe(1);

    // Define desired state (add columns)
    const desiredSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'varchar', notNull: true, primaryKey: false },
              { name: 'name', type: 'varchar', notNull: false, primaryKey: false },
              { name: 'age', type: 'integer', notNull: false, primaryKey: false },
            ],
            indexes: [
              { name: 'idx_email', columns: ['email'], unique: true },
            ],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
      ]),
    };

    // Diff schemas
    const differ = new SchemaDiffer(currentSchema, desiredSchema);
    const changes = differ.diff();

    expect(changes.length).toBeGreaterThanOrEqual(2); // alter_table + create_index

    // Generate SQL
    const sqlGenerator = new SqlGenerator('postgresql');
    const { upStatements, downStatements } = sqlGenerator.generate(changes);

    expect(upStatements.length).toBeGreaterThanOrEqual(2);
    expect(upStatements.some((s) => s.includes('ALTER TABLE'))).toBe(true);
    expect(upStatements.some((s) => s.includes('CREATE UNIQUE INDEX'))).toBe(true);
    expect(downStatements.length).toBeGreaterThanOrEqual(2);
  });
});
