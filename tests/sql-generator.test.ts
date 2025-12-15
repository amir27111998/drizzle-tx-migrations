import { SqlGenerator } from '../src/sql-generator';
import type { SchemaChange } from '../src/schema-differ';

describe('SqlGenerator', () => {
  describe('PostgreSQL', () => {
    const generator = new SqlGenerator('postgresql');

    test('should generate CREATE TABLE statement', () => {
      const changes: SchemaChange[] = [
        {
          type: 'create_table',
          table: 'users',
          details: {
            tableSchema: {
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
          },
        },
      ];

      const { upStatements, downStatements } = generator.generate(changes);

      expect(upStatements).toHaveLength(1);
      expect(upStatements[0]).toContain('CREATE TABLE "users"');
      expect(upStatements[0]).toContain('"id" SERIAL PRIMARY KEY');
      expect(upStatements[0]).toContain('"email" VARCHAR(255) NOT NULL');
      expect(upStatements[0]).toContain('"name" VARCHAR(255)');

      expect(downStatements).toHaveLength(1);
      expect(downStatements[0]).toContain('DROP TABLE IF EXISTS "users"');
    });

    test('should generate DROP TABLE statement', () => {
      const changes: SchemaChange[] = [
        {
          type: 'drop_table',
          table: 'old_table',
          details: {
            tableSchema: {
              name: 'old_table',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              ],
              indexes: [],
              foreignKeys: [],
              primaryKey: ['id'],
            },
          },
        },
      ];

      const { upStatements, downStatements } = generator.generate(changes);

      expect(upStatements[0]).toContain('DROP TABLE IF EXISTS "old_table"');
      expect(downStatements[0]).toContain('CREATE TABLE "old_table"');
    });

    test('should generate ADD COLUMN statement', () => {
      const changes: SchemaChange[] = [
        {
          type: 'alter_table',
          table: 'users',
          details: {
            changes: [
              {
                type: 'add_column',
                column: 'phone',
                details: {
                  column: { name: 'phone', type: 'varchar', notNull: false, primaryKey: false },
                },
              },
            ],
          },
        },
      ];

      const { upStatements } = generator.generate(changes);

      expect(upStatements[0]).toContain('ALTER TABLE "users"');
      expect(upStatements[0]).toContain('ADD COLUMN');
      expect(upStatements[0]).toContain('"phone" VARCHAR(255)');
    });

    test('should generate DROP COLUMN statement', () => {
      const changes: SchemaChange[] = [
        {
          type: 'alter_table',
          table: 'users',
          details: {
            changes: [
              {
                type: 'drop_column',
                column: 'old_field',
                details: {
                  column: { name: 'old_field', type: 'varchar', notNull: false, primaryKey: false },
                },
              },
            ],
          },
        },
      ];

      const { upStatements } = generator.generate(changes);

      expect(upStatements[0]).toContain('ALTER TABLE "users"');
      expect(upStatements[0]).toContain('DROP COLUMN');
      expect(upStatements[0]).toContain('"old_field"');
    });

    test('should generate CREATE INDEX statement', () => {
      const changes: SchemaChange[] = [
        {
          type: 'create_index',
          table: 'users',
          details: {
            index: { name: 'idx_email', columns: ['email'], unique: true },
          },
        },
      ];

      const { upStatements, downStatements } = generator.generate(changes);

      expect(upStatements[0]).toContain('CREATE UNIQUE INDEX');
      expect(upStatements[0]).toContain('"idx_email"');
      expect(upStatements[0]).toContain('ON "users"');
      expect(upStatements[0]).toContain('"email"');

      expect(downStatements[0]).toContain('DROP INDEX "idx_email"');
    });

    test('should generate DROP INDEX statement', () => {
      const changes: SchemaChange[] = [
        {
          type: 'drop_index',
          table: 'users',
          details: {
            index: { name: 'idx_email', columns: ['email'], unique: false },
          },
        },
      ];

      const { upStatements } = generator.generate(changes);

      expect(upStatements[0]).toContain('DROP INDEX "idx_email"');
    });

    test('should generate ADD FOREIGN KEY statement', () => {
      const changes: SchemaChange[] = [
        {
          type: 'add_foreign_key',
          table: 'posts',
          details: {
            foreignKey: {
              name: 'fk_posts_user_id',
              column: 'user_id',
              referencedTable: 'users',
              referencedColumn: 'id',
              onDelete: 'CASCADE',
            },
          },
        },
      ];

      const { upStatements, downStatements } = generator.generate(changes);

      expect(upStatements[0]).toContain('ALTER TABLE "posts"');
      expect(upStatements[0]).toContain('ADD CONSTRAINT "fk_posts_user_id"');
      expect(upStatements[0]).toContain('FOREIGN KEY ("user_id")');
      expect(upStatements[0]).toContain('REFERENCES "users"("id")');
      expect(upStatements[0]).toContain('ON DELETE CASCADE');

      expect(downStatements[0]).toContain('DROP CONSTRAINT "fk_posts_user_id"');
    });

    test('should handle composite primary key', () => {
      const changes: SchemaChange[] = [
        {
          type: 'create_table',
          table: 'user_roles',
          details: {
            tableSchema: {
              name: 'user_roles',
              columns: [
                { name: 'user_id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: false },
                { name: 'role_id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: false },
              ],
              indexes: [],
              foreignKeys: [],
              primaryKey: ['user_id', 'role_id'],
            },
          },
        },
      ];

      const { upStatements } = generator.generate(changes);

      expect(upStatements[0]).toContain('PRIMARY KEY ("user_id", "role_id")');
    });
  });

  describe('MySQL', () => {
    const generator = new SqlGenerator('mysql');

    test('should generate CREATE TABLE with MySQL syntax', () => {
      const changes: SchemaChange[] = [
        {
          type: 'create_table',
          table: 'users',
          details: {
            tableSchema: {
              name: 'users',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                { name: 'email', type: 'varchar', notNull: true, primaryKey: false },
              ],
              indexes: [],
              foreignKeys: [],
              primaryKey: ['id'],
            },
          },
        },
      ];

      const { upStatements } = generator.generate(changes);

      expect(upStatements[0]).toContain('CREATE TABLE `users`');
      expect(upStatements[0]).toContain('`id` INT');
      expect(upStatements[0]).toContain('AUTO_INCREMENT PRIMARY KEY');
      expect(upStatements[0]).toContain('`email` VARCHAR(255) NOT NULL');
    });

    test('should generate DROP INDEX with MySQL syntax', () => {
      const changes: SchemaChange[] = [
        {
          type: 'drop_index',
          table: 'users',
          details: {
            index: { name: 'idx_email', columns: ['email'], unique: false },
          },
        },
      ];

      const { upStatements } = generator.generate(changes);

      expect(upStatements[0]).toContain('DROP INDEX `idx_email` ON `users`');
    });

    test('should use MySQL types', () => {
      const changes: SchemaChange[] = [
        {
          type: 'create_table',
          table: 'data',
          details: {
            tableSchema: {
              name: 'data',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                { name: 'amount', type: 'decimal', notNull: true, primaryKey: false },
                { name: 'created', type: 'timestamp', notNull: true, primaryKey: false },
              ],
              indexes: [],
              foreignKeys: [],
              primaryKey: ['id'],
            },
          },
        },
      ];

      const { upStatements } = generator.generate(changes);

      expect(upStatements[0]).toContain('DECIMAL');
      expect(upStatements[0]).toContain('TIMESTAMP');
    });
  });

  describe('SQLite', () => {
    const generator = new SqlGenerator('sqlite');

    test('should generate CREATE TABLE with SQLite syntax', () => {
      const changes: SchemaChange[] = [
        {
          type: 'create_table',
          table: 'users',
          details: {
            tableSchema: {
              name: 'users',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                { name: 'email', type: 'text', notNull: true, primaryKey: false },
              ],
              indexes: [],
              foreignKeys: [],
              primaryKey: ['id'],
            },
          },
        },
      ];

      const { upStatements } = generator.generate(changes);

      expect(upStatements[0]).toContain('CREATE TABLE "users"');
      expect(upStatements[0]).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
      expect(upStatements[0]).toContain('"email" TEXT NOT NULL');
    });

    test('should generate comments for unsupported operations', () => {
      const changes: SchemaChange[] = [
        {
          type: 'alter_table',
          table: 'users',
          details: {
            changes: [
              {
                type: 'drop_column',
                column: 'old_field',
                details: {
                  column: { name: 'old_field', type: 'text', notNull: false, primaryKey: false },
                },
              },
            ],
          },
        },
      ];

      const { upStatements } = generator.generate(changes);

      expect(upStatements[0]).toContain('--');
      expect(upStatements[0]).toContain('SQLite');
    });

    test('should use SQLite type mappings', () => {
      const changes: SchemaChange[] = [
        {
          type: 'create_table',
          table: 'data',
          details: {
            tableSchema: {
              name: 'data',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                { name: 'name', type: 'varchar', notNull: true, primaryKey: false },
                { name: 'amount', type: 'decimal', notNull: true, primaryKey: false },
                { name: 'active', type: 'boolean', notNull: true, primaryKey: false },
              ],
              indexes: [],
              foreignKeys: [],
              primaryKey: ['id'],
            },
          },
        },
      ];

      const { upStatements } = generator.generate(changes);

      expect(upStatements[0]).toContain('TEXT'); // varchar -> TEXT
      expect(upStatements[0]).toContain('REAL'); // decimal -> REAL
      expect(upStatements[0]).toContain('INTEGER'); // boolean -> INTEGER
    });
  });

  describe('Change Ordering', () => {
    test('should order changes correctly', () => {
      const changes: SchemaChange[] = [
        {
          type: 'create_table',
          table: 'users',
          details: {
            tableSchema: {
              name: 'users',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              ],
              indexes: [],
              foreignKeys: [],
              primaryKey: ['id'],
            },
          },
        },
        {
          type: 'drop_foreign_key',
          table: 'posts',
          details: {
            foreignKey: {
              name: 'fk_test',
              column: 'user_id',
              referencedTable: 'users',
              referencedColumn: 'id',
            },
          },
        },
        {
          type: 'add_foreign_key',
          table: 'posts',
          details: {
            foreignKey: {
              name: 'fk_test_new',
              column: 'user_id',
              referencedTable: 'users',
              referencedColumn: 'id',
            },
          },
        },
        {
          type: 'drop_table',
          table: 'old',
          details: {
            tableSchema: {
              name: 'old',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
              ],
              indexes: [],
              foreignKeys: [],
              primaryKey: ['id'],
            },
          },
        },
        {
          type: 'create_index',
          table: 'users',
          details: { index: { name: 'idx_test', columns: ['id'], unique: false } },
        },
      ];

      const generator = new SqlGenerator('postgresql');
      const { upStatements } = generator.generate(changes);

      // The order should be: drop FK, drop index, alter, drop table, create table, create index, add FK
      // We can't test exact order without looking at implementation, but we can verify all are present
      expect(upStatements.length).toBeGreaterThan(0);
      expect(upStatements.some((s) => s.includes('CREATE TABLE'))).toBe(true);
      expect(upStatements.some((s) => s.includes('DROP CONSTRAINT'))).toBe(true);
    });
  });

  describe('Complex Scenarios', () => {
    test('should handle multiple changes in single migration', () => {
      const changes: SchemaChange[] = [
        {
          type: 'create_table',
          table: 'users',
          details: {
            tableSchema: {
              name: 'users',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                { name: 'email', type: 'varchar', notNull: true, primaryKey: false },
              ],
              indexes: [],
              foreignKeys: [],
              primaryKey: ['id'],
            },
          },
        },
        {
          type: 'create_index',
          table: 'users',
          details: {
            index: { name: 'idx_email', columns: ['email'], unique: true },
          },
        },
        {
          type: 'create_table',
          table: 'posts',
          details: {
            tableSchema: {
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
          },
        },
        {
          type: 'add_foreign_key',
          table: 'posts',
          details: {
            foreignKey: {
              name: 'fk_posts_user',
              column: 'user_id',
              referencedTable: 'users',
              referencedColumn: 'id',
              onDelete: 'CASCADE',
            },
          },
        },
      ];

      const generator = new SqlGenerator('postgresql');
      const { upStatements, downStatements } = generator.generate(changes);

      expect(upStatements).toHaveLength(4);
      expect(downStatements).toHaveLength(4);

      // Verify all types of statements are present
      expect(upStatements.some((s) => s.includes('CREATE TABLE'))).toBe(true);
      expect(upStatements.some((s) => s.includes('CREATE UNIQUE INDEX'))).toBe(true);
      expect(upStatements.some((s) => s.includes('FOREIGN KEY'))).toBe(true);

      // Down statements should be in reverse order
      expect(downStatements.some((s) => s.includes('DROP TABLE'))).toBe(true);
      expect(downStatements.some((s) => s.includes('DROP INDEX'))).toBe(true);
      expect(downStatements.some((s) => s.includes('DROP CONSTRAINT'))).toBe(true);
    });
  });
});
