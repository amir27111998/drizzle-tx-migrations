import { SchemaDiffer } from '../src/schema-differ';
import type { DatabaseSchema, TableSchema } from '../src/schema-introspector';

describe('SchemaDiffer', () => {
  describe('Table Operations', () => {
    test('should detect new table creation', () => {
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

    test('should detect table drop', () => {
      const currentSchema: DatabaseSchema = {
        tables: new Map([
          [
            'old_table',
            {
              name: 'old_table',
              columns: [{ name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true }],
              indexes: [],
              foreignKeys: [],
              primaryKey: ['id'],
            },
          ],
        ]),
      };
      const desiredSchema: DatabaseSchema = { tables: new Map() };

      const differ = new SchemaDiffer(currentSchema, desiredSchema);
      const changes = differ.diff();

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('drop_table');
      expect(changes[0].table).toBe('old_table');
    });

    test('should detect no changes when schemas are identical', () => {
      const schema: DatabaseSchema = {
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
        ]),
      };

      const differ = new SchemaDiffer(schema, schema);
      const changes = differ.diff();

      expect(changes).toHaveLength(0);
    });
  });

  describe('Column Operations', () => {
    test('should detect new column addition', () => {
      const currentSchema: DatabaseSchema = {
        tables: new Map([
          [
            'users',
            {
              name: 'users',
              columns: [{ name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true }],
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
        ]),
      };

      const differ = new SchemaDiffer(currentSchema, desiredSchema);
      const changes = differ.diff();

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('alter_table');
      expect(changes[0].table).toBe('users');
      expect(changes[0].details.changes).toHaveLength(1);
      expect(changes[0].details.changes[0].type).toBe('add_column');
      expect(changes[0].details.changes[0].column).toBe('email');
    });

    test('should detect column drop', () => {
      const currentSchema: DatabaseSchema = {
        tables: new Map([
          [
            'users',
            {
              name: 'users',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                { name: 'old_field', type: 'varchar', notNull: false, primaryKey: false },
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
              columns: [{ name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true }],
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
      expect(changes[0].type).toBe('alter_table');
      expect(changes[0].details.changes[0].type).toBe('drop_column');
      expect(changes[0].details.changes[0].column).toBe('old_field');
    });

    test('should detect column type modification', () => {
      const currentSchema: DatabaseSchema = {
        tables: new Map([
          [
            'users',
            {
              name: 'users',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                { name: 'age', type: 'integer', notNull: false, primaryKey: false },
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
                { name: 'age', type: 'bigint', notNull: false, primaryKey: false },
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
      expect(changes[0].details.changes[0].type).toBe('modify_column');
      expect(changes[0].details.changes[0].column).toBe('age');
    });

    test('should detect notNull constraint change', () => {
      const currentSchema: DatabaseSchema = {
        tables: new Map([
          [
            'users',
            {
              name: 'users',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                { name: 'email', type: 'varchar', notNull: false, primaryKey: false },
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
        ]),
      };

      const differ = new SchemaDiffer(currentSchema, desiredSchema);
      const changes = differ.diff();

      expect(changes).toHaveLength(1);
      expect(changes[0].details.changes[0].type).toBe('modify_column');
    });
  });

  describe('Index Operations', () => {
    test('should detect new index creation', () => {
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
              indexes: [{ name: 'idx_email', columns: ['email'], unique: true }],
              foreignKeys: [],
              primaryKey: ['id'],
            },
          ],
        ]),
      };

      const differ = new SchemaDiffer(currentSchema, desiredSchema);
      const changes = differ.diff();

      const indexChanges = changes.filter((c) => c.type === 'create_index');
      expect(indexChanges).toHaveLength(1);
      expect(indexChanges[0].details.index.name).toBe('idx_email');
      expect(indexChanges[0].details.index.unique).toBe(true);
    });

    test('should detect index drop', () => {
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
              indexes: [{ name: 'idx_email', columns: ['email'], unique: true }],
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
        ]),
      };

      const differ = new SchemaDiffer(currentSchema, desiredSchema);
      const changes = differ.diff();

      const indexChanges = changes.filter((c) => c.type === 'drop_index');
      expect(indexChanges).toHaveLength(1);
      expect(indexChanges[0].details.index.name).toBe('idx_email');
    });

    test('should detect index modification (drop and recreate)', () => {
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
              indexes: [{ name: 'idx_email', columns: ['email'], unique: false }],
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
              indexes: [{ name: 'idx_email', columns: ['email'], unique: true }],
              foreignKeys: [],
              primaryKey: ['id'],
            },
          ],
        ]),
      };

      const differ = new SchemaDiffer(currentSchema, desiredSchema);
      const changes = differ.diff();

      const indexChanges = changes.filter((c) => c.type === 'drop_index' || c.type === 'create_index');
      expect(indexChanges).toHaveLength(2); // Should drop and recreate
    });
  });

  describe('Foreign Key Operations', () => {
    test('should detect new foreign key', () => {
      const currentSchema: DatabaseSchema = {
        tables: new Map([
          [
            'posts',
            {
              name: 'posts',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                { name: 'user_id', type: 'integer', notNull: true, primaryKey: false },
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
            'posts',
            {
              name: 'posts',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                { name: 'user_id', type: 'integer', notNull: true, primaryKey: false },
              ],
              indexes: [],
              foreignKeys: [
                {
                  name: 'fk_posts_user_id',
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

      const fkChanges = changes.filter((c) => c.type === 'add_foreign_key');
      expect(fkChanges).toHaveLength(1);
      expect(fkChanges[0].details.foreignKey.column).toBe('user_id');
      expect(fkChanges[0].details.foreignKey.referencedTable).toBe('users');
    });

    test('should detect foreign key drop', () => {
      const currentSchema: DatabaseSchema = {
        tables: new Map([
          [
            'posts',
            {
              name: 'posts',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                { name: 'user_id', type: 'integer', notNull: true, primaryKey: false },
              ],
              indexes: [],
              foreignKeys: [
                {
                  name: 'fk_posts_user_id',
                  column: 'user_id',
                  referencedTable: 'users',
                  referencedColumn: 'id',
                },
              ],
              primaryKey: ['id'],
            },
          ],
        ]),
      };

      const desiredSchema: DatabaseSchema = {
        tables: new Map([
          [
            'posts',
            {
              name: 'posts',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                { name: 'user_id', type: 'integer', notNull: true, primaryKey: false },
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

      const fkChanges = changes.filter((c) => c.type === 'drop_foreign_key');
      expect(fkChanges).toHaveLength(1);
      expect(fkChanges[0].details.foreignKey.name).toBe('fk_posts_user_id');
    });
  });

  describe('Complex Scenarios', () => {
    test('should detect multiple changes at once', () => {
      const currentSchema: DatabaseSchema = {
        tables: new Map([
          [
            'users',
            {
              name: 'users',
              columns: [
                { name: 'id', type: 'integer', notNull: true, primaryKey: true, autoIncrement: true },
                { name: 'old_field', type: 'varchar', notNull: false, primaryKey: false },
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
                { name: 'name', type: 'varchar', notNull: false, primaryKey: false },
              ],
              indexes: [{ name: 'idx_email', columns: ['email'], unique: true }],
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

      const differ = new SchemaDiffer(currentSchema, desiredSchema);
      const changes = differ.diff();

      // Should have: alter table (with column changes), create table, create index
      expect(changes.length).toBeGreaterThanOrEqual(3);

      const createTableChanges = changes.filter((c) => c.type === 'create_table');
      expect(createTableChanges).toHaveLength(1);
      expect(createTableChanges[0].table).toBe('posts');

      const alterTableChanges = changes.filter((c) => c.type === 'alter_table');
      expect(alterTableChanges).toHaveLength(1);

      const indexChanges = changes.filter((c) => c.type === 'create_index');
      expect(indexChanges).toHaveLength(1);
    });
  });
});
