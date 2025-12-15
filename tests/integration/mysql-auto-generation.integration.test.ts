import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';
import { Migrator } from '../../src/migrator';
import { MigrationGenerator } from '../../src/generator';
import { SchemaIntrospector } from '../../src/schema-introspector';
import { SchemaDiffer } from '../../src/schema-differ';
import { SqlGenerator } from '../../src/sql-generator';
import type { DatabaseSchema } from '../../src/schema-introspector';

describe('MySQL Auto-Generation Integration Tests', () => {
  let masterPool: mysql.Pool;
  let pool: mysql.Pool;
  let db: any;
  let testDir: string;
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
    testDatabase = `test_db_${testId}`;
    testDir = path.join(__dirname, `../test-migrations-mysql-auto-${testId}`);

    await masterPool.query(`CREATE DATABASE ${testDatabase}`);

    pool = mysql.createPool({
      host: 'localhost',
      port: 33060,
      user: 'root',
      password: 'rootpass',
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

  test('should introspect MySQL database schema', async () => {
    await pool.query(`
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const introspector = new SchemaIntrospector(db, 'mysql');
    const schema = await introspector.introspect();

    expect(schema.tables.size).toBe(1);
    expect(schema.tables.has('users')).toBe(true);

    const usersTable = schema.tables.get('users')!;
    expect(usersTable.columns.length).toBeGreaterThanOrEqual(4);
    expect(usersTable.columns.find((c) => c.name === 'email')?.notNull).toBe(true);
    expect(usersTable.columns.find((c) => c.name === 'id')?.primaryKey).toBe(true);
    expect(usersTable.columns.find((c) => c.name === 'id')?.autoIncrement).toBe(true);
  });

  test('should introspect table with indexes', async () => {
    await pool.query(`
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        username VARCHAR(100) NOT NULL,
        UNIQUE KEY idx_email (email),
        KEY idx_username (username)
      )
    `);

    const introspector = new SchemaIntrospector(db, 'mysql');
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
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    const introspector = new SchemaIntrospector(db, 'mysql');
    const schema = await introspector.introspect();

    const postsTable = schema.tables.get('posts')!;
    expect(postsTable.foreignKeys).toHaveLength(1);
    expect(postsTable.foreignKeys[0].column).toBe('user_id');
    expect(postsTable.foreignKeys[0].referencedTable).toBe('users');
    expect(postsTable.foreignKeys[0].referencedColumn).toBe('id');
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
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL
      )
    `);

    const introspector = new SchemaIntrospector(db, 'mysql');
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

  test('should generate MySQL-specific SQL', () => {
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
              { name: 'data', type: 'json', notNull: false, primaryKey: false },
              { name: 'created_at', type: 'timestamp', notNull: false, primaryKey: false },
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

    const sqlGenerator = new SqlGenerator('mysql');
    const { upStatements, downStatements } = sqlGenerator.generate(changes);

    expect(upStatements).toHaveLength(1);
    expect(upStatements[0]).toContain('CREATE TABLE `users`');
    expect(upStatements[0]).toContain('AUTO_INCREMENT PRIMARY KEY');
    expect(upStatements[0]).toContain('JSON');
    expect(upStatements[0]).toContain('TIMESTAMP');

    expect(downStatements).toHaveLength(1);
    expect(downStatements[0]).toContain('DROP TABLE IF EXISTS `users`');
  });

  test('should generate SQL for indexes with MySQL syntax', () => {
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

    const sqlGenerator = new SqlGenerator('mysql');
    const { upStatements } = sqlGenerator.generate(changes);

    expect(upStatements.length).toBeGreaterThanOrEqual(2);
    expect(upStatements.some((s) => s.includes('CREATE TABLE'))).toBe(true);
    expect(upStatements.some((s) => s.includes('CREATE UNIQUE INDEX'))).toBe(true);
    expect(upStatements.some((s) => s.includes('idx_users_email'))).toBe(true);

    // MySQL uses backticks
    expect(upStatements.some((s) => s.includes('`users`'))).toBe(true);
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

    const sqlGenerator = new SqlGenerator('mysql');
    const { upStatements } = sqlGenerator.generate(changes);

    const fkStatement = upStatements.find((s) => s.includes('FOREIGN KEY'));
    expect(fkStatement).toBeDefined();
    expect(fkStatement).toContain('fk_posts_user');
    expect(fkStatement).toContain('user_id');
    expect(fkStatement).toContain('REFERENCES `users`(`id`)');
    expect(fkStatement).toContain('ON DELETE CASCADE');
  });

  test('should run generated migrations on MySQL', async () => {
    const generator = new MigrationGenerator(testDir);
    const migrationPath = await generator.generateMigration('create_users');

    const migrationContent = `
import { type MigrationContext } from 'drizzle-tx-migrations';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`
    CREATE TABLE users (
      id INT AUTO_INCREMENT PRIMARY KEY,
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
      dialect: 'mysql',
      config: { migrationsFolder: testDir },
    });

    const result = await migrator.runMigrations();
    expect(result.success).toBe(true);
    expect(result.executed.length).toBe(1);

    const [tablesResult] = await pool.query(`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
    `, [testDatabase]);

    expect((tablesResult as any[]).length).toBe(1);
  });

  test('should revert migrations on MySQL', async () => {
    const generator = new MigrationGenerator(testDir);
    const migrationPath = await generator.generateMigration('create_users');

    const migrationContent = `
import { type MigrationContext } from 'drizzle-tx-migrations';

export async function up({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255) NOT NULL)\`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  await db.execute(sql\`DROP TABLE IF EXISTS users\`);
}

export default { up, down };
`;
    fs.writeFileSync(migrationPath, migrationContent);

    const migrator = new Migrator({
      db,
      dialect: 'mysql',
      config: { migrationsFolder: testDir },
    });

    await migrator.runMigrations();

    let [tablesResult] = await pool.query(`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
    `, [testDatabase]);
    expect((tablesResult as any[]).length).toBe(1);

    const revertResult = await migrator.revertMigration(1);
    expect(revertResult.success).toBe(true);

    [tablesResult] = await pool.query(`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
    `, [testDatabase]);
    expect((tablesResult as any[]).length).toBe(0);
  });

  test('should handle full auto-generation flow on MySQL', async () => {
    // Create initial table
    await pool.query(`
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL
      )
    `);

    // Introspect current state
    const introspector = new SchemaIntrospector(db, 'mysql');
    const currentSchema = await introspector.introspect();

    expect(currentSchema.tables.size).toBe(1);

    // Define desired state (add columns and index)
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
    const sqlGenerator = new SqlGenerator('mysql');
    const { upStatements, downStatements } = sqlGenerator.generate(changes);

    expect(upStatements.length).toBeGreaterThanOrEqual(2);
    expect(upStatements.some((s) => s.includes('ALTER TABLE'))).toBe(true);
    expect(upStatements.some((s) => s.includes('CREATE UNIQUE INDEX'))).toBe(true);
    expect(downStatements.length).toBeGreaterThanOrEqual(2);
  });

  test('should handle MySQL-specific types', async () => {
    await pool.query(`
      CREATE TABLE products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        description TEXT,
        data JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const introspector = new SchemaIntrospector(db, 'mysql');
    const schema = await introspector.introspect();

    const productsTable = schema.tables.get('products')!;
    expect(productsTable).toBeDefined();

    const priceCol = productsTable.columns.find((c) => c.name === 'price');
    expect(priceCol).toBeDefined();
    expect(priceCol!.type).toBe('decimal');

    const dataCol = productsTable.columns.find((c) => c.name === 'data');
    expect(dataCol).toBeDefined();
    expect(dataCol!.type).toBe('json');
  });
});
