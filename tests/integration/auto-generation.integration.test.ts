import * as fs from 'fs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { MigrationGenerator } from '../../src/generator';
import { Migrator } from '../../src/migrator';
import { SchemaIntrospector } from '../../src/schema-introspector';
import { SchemaDiffer } from '../../src/schema-differ';
import { SqlGenerator } from '../../src/sql-generator';
import { setupTestEnvironment, cleanupTestEnvironment } from '../setup';
import type { DatabaseSchema } from '../../src/schema-introspector';

describe('Auto-Generation Integration Tests', () => {
  let testDir: string;
  let testDb: string;
  let sqlite: Database.Database;
  let db: any;

  beforeEach(() => {
    const setup = setupTestEnvironment();
    testDir = setup.testDir;
    testDb = setup.testDb;

    sqlite = new Database(testDb);
    db = drizzle(sqlite);
  });

  afterEach(() => {
    sqlite?.close();
    cleanupTestEnvironment(testDir, testDb);
  });

  test('should introspect SQLite database schema', async () => {
    // Create a table
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        name TEXT
      )
    `);

    const introspector = new SchemaIntrospector(db, 'sqlite');
    const schema = await introspector.introspect();

    expect(schema.tables.size).toBe(1);
    expect(schema.tables.has('users')).toBe(true);

    const usersTable = schema.tables.get('users')!;
    expect(usersTable.columns).toHaveLength(3);
    expect(usersTable.columns.find((c) => c.name === 'email')?.notNull).toBe(true);
  });

  test('should introspect table with indexes', async () => {
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        name TEXT
      );
      CREATE UNIQUE INDEX idx_email ON users(email);
    `);

    const introspector = new SchemaIntrospector(db, 'sqlite');
    const schema = await introspector.introspect();

    const usersTable = schema.tables.get('users')!;
    expect(usersTable.indexes).toHaveLength(1);
    expect(usersTable.indexes[0].name).toBe('idx_email');
    expect(usersTable.indexes[0].unique).toBe(true);
  });

  test('should introspect table with foreign keys', async () => {
    sqlite.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL
      );

      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    const introspector = new SchemaIntrospector(db, 'sqlite');
    const schema = await introspector.introspect();

    const postsTable = schema.tables.get('posts')!;
    expect(postsTable.foreignKeys).toHaveLength(1);
    expect(postsTable.foreignKeys[0].column).toBe('user_id');
    expect(postsTable.foreignKeys[0].referencedTable).toBe('users');
    expect(postsTable.foreignKeys[0].onDelete).toBe('CASCADE');
  });

  test('should detect schema differences', async () => {
    // Current: empty database
    const currentSchema: DatabaseSchema = { tables: new Map() };

    // Desired: database with users table
    const desiredSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'text', notNull: true, primaryKey: false },
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

  test('should generate SQL from schema changes', () => {
    const desiredSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'text', notNull: true, primaryKey: false },
            ],
            indexes: [],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
      ]),
    };

    const currentSchema: DatabaseSchema = { tables: new Map() };
    const differ = new SchemaDiffer(currentSchema, desiredSchema);
    const changes = differ.diff();

    const sqlGenerator = new SqlGenerator('sqlite');
    const { upStatements, downStatements } = sqlGenerator.generate(changes);

    expect(upStatements).toHaveLength(1);
    expect(upStatements[0]).toContain('CREATE TABLE');
    expect(upStatements[0]).toContain('users');

    expect(downStatements).toHaveLength(1);
    expect(downStatements[0]).toContain('DROP TABLE');
  });

  test('should generate blank migration without schema config', async () => {
    const generator = new MigrationGenerator(testDir); // No schema files
    const migrationPath = await generator.generateMigration('blank_migration');

    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, 'utf-8');
    expect(content).toContain('// Write your migration logic here');
    expect(content).not.toContain('auto-generated from schema changes');
  });

  // Note: Migrator execution tests are skipped for SQLite in integration tests
  // because better-sqlite3 uses a different API (run/all) vs execute
  // Migrator functionality is thoroughly tested in unit tests with mocked DBs

  test('should handle full introspection to SQL generation flow', async () => {
    // Start with a table in the database
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL
      )
    `);

    // Introspect current state
    const introspector = new SchemaIntrospector(db, 'sqlite');
    const currentSchema = await introspector.introspect();

    // Define desired state (add a name column)
    const desiredSchema: DatabaseSchema = {
      tables: new Map([
        [
          'users',
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'email', type: 'text', notNull: true, primaryKey: false },
              { name: 'name', type: 'text', notNull: false, primaryKey: false },
            ],
            indexes: [],
            foreignKeys: [],
            primaryKey: ['id'],
          },
        ],
      ]),
    };

    // Diff the schemas
    const differ = new SchemaDiffer(currentSchema, desiredSchema);
    const changes = differ.diff();

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('alter_table');

    // Generate SQL
    const sqlGenerator = new SqlGenerator('sqlite');
    const { upStatements, downStatements } = sqlGenerator.generate(changes);

    // Should have at least one ALTER TABLE statement
    expect(upStatements.length).toBeGreaterThanOrEqual(1);
    const alterStatement = upStatements.find((s) => s.includes('ALTER TABLE'));
    expect(alterStatement).toBeDefined();
    expect(alterStatement).toContain('ADD COLUMN');
    expect(alterStatement).toContain('name');
  });

  test('should preserve data during SQLite table recreation for DROP COLUMN', async () => {
    // Create a table with data
    sqlite.exec(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL
      )
    `);

    // Insert test data
    sqlite.exec(`
      INSERT INTO products (name, description, price) VALUES
        ('Product A', 'Description A', 10.99),
        ('Product B', 'Description B', 20.50),
        ('Product C', NULL, 30.00)
    `);

    // Verify data exists
    const beforeData = sqlite.prepare('SELECT * FROM products ORDER BY id').all();
    expect(beforeData).toHaveLength(3);
    expect(beforeData[0]).toMatchObject({ id: 1, name: 'Product A', price: 10.99 });
    expect(beforeData[1]).toMatchObject({ id: 2, name: 'Product B', price: 20.50 });
    expect(beforeData[2]).toMatchObject({ id: 3, name: 'Product C', price: 30.00 });

    // Generate SQL to drop the 'description' column using table recreation
    const sqlGenerator = new SqlGenerator('sqlite');
    const changes = [
      {
        type: 'alter_table' as const,
        table: 'products',
        details: {
          changes: [
            {
              type: 'drop_column' as const,
              column: 'description',
              details: {
                column: { name: 'description', type: 'text', notNull: false, primaryKey: false },
                tableSchema: {
                  name: 'products',
                  columns: [
                    { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                    { name: 'name', type: 'text', notNull: true, primaryKey: false },
                    { name: 'description', type: 'text', notNull: false, primaryKey: false },
                    { name: 'price', type: 'real', notNull: true, primaryKey: false },
                  ],
                  indexes: [],
                  foreignKeys: [],
                  primaryKey: ['id'],
                },
              },
            },
          ],
        },
      },
    ];

    const { upStatements } = sqlGenerator.generate(changes);

    // Verify the generated SQL uses table recreation pattern
    expect(upStatements).toContainEqual('PRAGMA foreign_keys=OFF;');
    expect(upStatements).toContainEqual(expect.stringContaining('RENAME TO'));
    expect(upStatements).toContainEqual(expect.stringContaining('INSERT INTO'));
    expect(upStatements).toContainEqual(expect.stringContaining('SELECT'));

    // Execute the migration
    for (const stmt of upStatements) {
      sqlite.exec(stmt);
    }

    // Verify data is preserved (minus the dropped column)
    const afterData = sqlite.prepare('SELECT * FROM products ORDER BY id').all() as any[];
    expect(afterData).toHaveLength(3);

    // All original data should be preserved
    expect(afterData[0]).toMatchObject({ id: 1, name: 'Product A', price: 10.99 });
    expect(afterData[1]).toMatchObject({ id: 2, name: 'Product B', price: 20.50 });
    expect(afterData[2]).toMatchObject({ id: 3, name: 'Product C', price: 30.00 });

    // The 'description' column should no longer exist
    expect(afterData[0]).not.toHaveProperty('description');

    // Verify table structure
    const tableInfo = sqlite.prepare('PRAGMA table_info(products)').all() as any[];
    const columnNames = tableInfo.map((col: any) => col.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('name');
    expect(columnNames).toContain('price');
    expect(columnNames).not.toContain('description');
  });

  test('should preserve data during SQLite table recreation for MODIFY COLUMN', async () => {
    // Create a table with data
    sqlite.exec(`
      CREATE TABLE users_modify (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        age INTEGER
      )
    `);

    // Insert test data (including NULL email which will need to be handled)
    sqlite.exec(`
      INSERT INTO users_modify (email, age) VALUES
        ('user1@test.com', 25),
        ('user2@test.com', 30),
        ('user3@test.com', 35)
    `);

    // Verify data exists
    const beforeData = sqlite.prepare('SELECT * FROM users_modify ORDER BY id').all();
    expect(beforeData).toHaveLength(3);

    // Generate SQL to modify 'email' column from nullable to NOT NULL
    const sqlGenerator = new SqlGenerator('sqlite');
    const changes = [
      {
        type: 'alter_table' as const,
        table: 'users_modify',
        details: {
          changes: [
            {
              type: 'modify_column' as const,
              column: 'email',
              details: {
                currentColumn: { name: 'email', type: 'text', notNull: false, primaryKey: false },
                desiredColumn: { name: 'email', type: 'text', notNull: true, primaryKey: false },
                tableSchema: {
                  name: 'users_modify',
                  columns: [
                    { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                    { name: 'email', type: 'text', notNull: false, primaryKey: false },
                    { name: 'age', type: 'integer', notNull: false, primaryKey: false },
                  ],
                  indexes: [],
                  foreignKeys: [],
                  primaryKey: ['id'],
                },
              },
            },
          ],
        },
      },
    ];

    const { upStatements } = sqlGenerator.generate(changes);

    // Verify the generated SQL uses table recreation pattern
    expect(upStatements).toContainEqual('PRAGMA foreign_keys=OFF;');
    expect(upStatements).toContainEqual(expect.stringContaining('RENAME TO'));

    // Execute the migration
    for (const stmt of upStatements) {
      sqlite.exec(stmt);
    }

    // Verify all data is preserved
    const afterData = sqlite.prepare('SELECT * FROM users_modify ORDER BY id').all() as any[];
    expect(afterData).toHaveLength(3);
    expect(afterData[0]).toMatchObject({ id: 1, email: 'user1@test.com', age: 25 });
    expect(afterData[1]).toMatchObject({ id: 2, email: 'user2@test.com', age: 30 });
    expect(afterData[2]).toMatchObject({ id: 3, email: 'user3@test.com', age: 35 });

    // Verify column is now NOT NULL in schema
    const tableInfo = sqlite.prepare('PRAGMA table_info(users_modify)').all() as any[];
    const emailCol = tableInfo.find((col: any) => col.name === 'email');
    expect(emailCol.notnull).toBe(1);
  });

  test('should preserve data and foreign key relationships during table recreation', async () => {
    // Create parent and child tables
    sqlite.exec(`
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      )
    `);

    sqlite.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category_id INTEGER,
        FOREIGN KEY (category_id) REFERENCES categories(id)
      )
    `);

    // Insert test data
    sqlite.exec(`
      INSERT INTO categories (name) VALUES ('Electronics'), ('Books'), ('Clothing')
    `);

    sqlite.exec(`
      INSERT INTO items (name, category_id) VALUES
        ('Laptop', 1),
        ('Novel', 2),
        ('T-Shirt', 3),
        ('Phone', 1)
    `);

    // Verify data exists
    const categoriesBefore = sqlite.prepare('SELECT * FROM categories ORDER BY id').all();
    const itemsBefore = sqlite.prepare('SELECT * FROM items ORDER BY id').all();
    expect(categoriesBefore).toHaveLength(3);
    expect(itemsBefore).toHaveLength(4);

    // Generate SQL to add a new foreign key constraint (simulating FK modification)
    const sqlGenerator = new SqlGenerator('sqlite');
    const changes = [
      {
        type: 'add_foreign_key' as const,
        table: 'items',
        details: {
          foreignKey: {
            name: 'fk_items_category',
            column: 'category_id',
            referencedTable: 'categories',
            referencedColumn: 'id',
            onDelete: 'CASCADE',
          },
          tableSchema: {
            name: 'items',
            columns: [
              { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              { name: 'name', type: 'text', notNull: true, primaryKey: false },
              { name: 'category_id', type: 'integer', notNull: false, primaryKey: false },
            ],
            indexes: [],
            foreignKeys: [
              {
                name: 'fk_items_category_old',
                column: 'category_id',
                referencedTable: 'categories',
                referencedColumn: 'id',
              },
            ],
            primaryKey: ['id'],
          },
        },
      },
    ];

    const { upStatements } = sqlGenerator.generate(changes);

    // Execute the migration
    for (const stmt of upStatements) {
      sqlite.exec(stmt);
    }

    // Verify all data is preserved
    const categoriesAfter = sqlite.prepare('SELECT * FROM categories ORDER BY id').all();
    const itemsAfter = sqlite.prepare('SELECT * FROM items ORDER BY id').all() as any[];

    expect(categoriesAfter).toHaveLength(3);
    expect(itemsAfter).toHaveLength(4);

    // Verify items data integrity
    expect(itemsAfter[0]).toMatchObject({ id: 1, name: 'Laptop', category_id: 1 });
    expect(itemsAfter[1]).toMatchObject({ id: 2, name: 'Novel', category_id: 2 });
    expect(itemsAfter[2]).toMatchObject({ id: 3, name: 'T-Shirt', category_id: 3 });
    expect(itemsAfter[3]).toMatchObject({ id: 4, name: 'Phone', category_id: 1 });

    // Verify foreign key relationships still work
    const joinQuery = sqlite.prepare(`
      SELECT i.name as item_name, c.name as category_name
      FROM items i
      JOIN categories c ON i.category_id = c.id
      ORDER BY i.id
    `).all() as any[];

    expect(joinQuery).toHaveLength(4);
    expect(joinQuery[0]).toMatchObject({ item_name: 'Laptop', category_name: 'Electronics' });
    expect(joinQuery[1]).toMatchObject({ item_name: 'Novel', category_name: 'Books' });
  });
});
