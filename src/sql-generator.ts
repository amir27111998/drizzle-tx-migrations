import type { DbDialect } from './types';
import type { SchemaChange, TableChange } from './schema-differ';
import type { TableColumn } from './schema-introspector';

export interface GeneratedSql {
  upStatements: string[];
  downStatements: string[];
}

export class SqlGenerator {
  constructor(private dialect: DbDialect) {}

  generate(changes: SchemaChange[]): GeneratedSql {
    const upStatements: string[] = [];
    const downStatements: string[] = [];

    // Process changes in a specific order for dependencies
    // 1. Drop foreign keys
    // 2. Drop indexes
    // 3. Alter tables
    // 4. Drop tables
    // 5. Create tables
    // 6. Create indexes
    // 7. Create foreign keys

    const orderedChanges = this.orderChanges(changes);

    for (const change of orderedChanges) {
      const { up, down } = this.generateChangeSQL(change);
      if (up) upStatements.push(...up);
      if (down) downStatements.unshift(...down); // Reverse order for down migration
    }

    return { upStatements, downStatements };
  }

  private orderChanges(changes: SchemaChange[]): SchemaChange[] {
    const order = [
      'drop_foreign_key',
      'drop_index',
      'alter_table',
      'drop_table',
      'create_table',
      'create_index',
      'add_foreign_key',
    ];

    return changes.sort((a, b) => {
      return order.indexOf(a.type) - order.indexOf(b.type);
    });
  }

  private generateChangeSQL(change: SchemaChange): { up: string[]; down: string[] } {
    switch (change.type) {
      case 'create_table':
        return this.generateCreateTable(change);
      case 'drop_table':
        return this.generateDropTable(change);
      case 'alter_table':
        return this.generateAlterTable(change);
      case 'create_index':
        return this.generateCreateIndex(change);
      case 'drop_index':
        return this.generateDropIndex(change);
      case 'add_foreign_key':
        return this.generateAddForeignKey(change);
      case 'drop_foreign_key':
        return this.generateDropForeignKey(change);
      default:
        return { up: [], down: [] };
    }
  }

  private generateCreateTable(change: SchemaChange): { up: string[]; down: string[] } {
    const { tableSchema } = change.details;
    const tableName = this.quote(change.table);

    const columnDefs = tableSchema.columns.map((col: TableColumn) =>
      this.generateColumnDefinition(col)
    );

    // Add primary key constraint if multiple columns
    if (tableSchema.primaryKey.length > 1) {
      const pkCols = tableSchema.primaryKey.map((c: string) => this.quote(c)).join(', ');
      columnDefs.push(`PRIMARY KEY (${pkCols})`);
    }

    const createSQL = `CREATE TABLE ${tableName} (\n  ${columnDefs.join(',\n  ')}\n);`;
    const dropSQL = `DROP TABLE IF EXISTS ${tableName};`;

    return {
      up: [createSQL],
      down: [dropSQL],
    };
  }

  private generateDropTable(change: SchemaChange): { up: string[]; down: string[] } {
    const { tableSchema } = change.details;
    const tableName = this.quote(change.table);

    const dropSQL = `DROP TABLE IF EXISTS ${tableName};`;

    // For down migration, recreate the table
    const columnDefs = tableSchema.columns.map((col: TableColumn) =>
      this.generateColumnDefinition(col)
    );

    if (tableSchema.primaryKey.length > 1) {
      const pkCols = tableSchema.primaryKey.map((c: string) => this.quote(c)).join(', ');
      columnDefs.push(`PRIMARY KEY (${pkCols})`);
    }

    const createSQL = `CREATE TABLE ${tableName} (\n  ${columnDefs.join(',\n  ')}\n);`;

    return {
      up: [dropSQL],
      down: [createSQL],
    };
  }

  private generateAlterTable(change: SchemaChange): { up: string[]; down: string[] } {
    const { changes: tableChanges } = change.details;
    const upStatements: string[] = [];
    const downStatements: string[] = [];

    for (const tableChange of tableChanges) {
      const { up, down } = this.generateTableChange(change.table, tableChange);
      if (up) upStatements.push(...up);
      if (down) downStatements.push(...down);
    }

    return { up: upStatements, down: downStatements };
  }

  private generateTableChange(
    tableName: string,
    change: TableChange
  ): { up: string[]; down: string[] } {
    const table = this.quote(tableName);

    switch (change.type) {
      case 'add_column': {
        const colDef = this.generateColumnDefinition(change.details.column);
        const addSQL =
          this.dialect === 'sqlite'
            ? `ALTER TABLE ${table} ADD COLUMN ${colDef};`
            : `ALTER TABLE ${table} ADD COLUMN ${colDef};`;

        const dropSQL =
          this.dialect === 'sqlite'
            ? `-- SQLite doesn't support DROP COLUMN natively, manual migration required`
            : `ALTER TABLE ${table} DROP COLUMN ${this.quote(change.column)};`;

        return { up: [addSQL], down: [dropSQL] };
      }

      case 'drop_column': {
        const colDef = this.generateColumnDefinition(change.details.column);
        const dropSQL =
          this.dialect === 'sqlite'
            ? `-- SQLite doesn't support DROP COLUMN natively, manual migration required`
            : `ALTER TABLE ${table} DROP COLUMN ${this.quote(change.column)};`;

        const addSQL =
          this.dialect === 'sqlite'
            ? `ALTER TABLE ${table} ADD COLUMN ${colDef};`
            : `ALTER TABLE ${table} ADD COLUMN ${colDef};`;

        return { up: [dropSQL], down: [addSQL] };
      }

      case 'modify_column': {
        const { currentColumn, desiredColumn } = change.details;
        const modifySQL = this.generateModifyColumn(tableName, desiredColumn);
        const revertSQL = this.generateModifyColumn(tableName, currentColumn);

        return { up: [modifySQL], down: [revertSQL] };
      }

      default:
        return { up: [], down: [] };
    }
  }

  private generateModifyColumn(tableName: string, column: TableColumn): string {
    const table = this.quote(tableName);
    const colName = this.quote(column.name);
    const colDef = this.generateColumnDefinition(column);

    if (this.dialect === 'postgresql') {
      // PostgreSQL requires separate ALTER commands for different attributes
      return `ALTER TABLE ${table} ALTER COLUMN ${colName} TYPE ${this.getColumnType(column)};`;
    } else if (this.dialect === 'mysql') {
      return `ALTER TABLE ${table} MODIFY COLUMN ${colDef};`;
    } else {
      // SQLite doesn't support ALTER COLUMN
      return `-- SQLite doesn't support MODIFY COLUMN natively, manual migration required`;
    }
  }

  private generateCreateIndex(change: SchemaChange): { up: string[]; down: string[] } {
    const { index } = change.details;
    const tableName = this.quote(change.table);
    const indexName = this.quote(index.name);
    const columns = index.columns.map((c: string) => this.quote(c)).join(', ');
    const unique = index.unique ? 'UNIQUE ' : '';

    const createSQL = `CREATE ${unique}INDEX ${indexName} ON ${tableName} (${columns});`;
    const dropSQL = `DROP INDEX ${this.dialect === 'mysql' ? `${indexName} ON ${tableName}` : indexName};`;

    return { up: [createSQL], down: [dropSQL] };
  }

  private generateDropIndex(change: SchemaChange): { up: string[]; down: string[] } {
    const { index } = change.details;
    const tableName = this.quote(change.table);
    const indexName = this.quote(index.name);
    const columns = index.columns.map((c: string) => this.quote(c)).join(', ');
    const unique = index.unique ? 'UNIQUE ' : '';

    const dropSQL = `DROP INDEX ${this.dialect === 'mysql' ? `${indexName} ON ${tableName}` : indexName};`;
    const createSQL = `CREATE ${unique}INDEX ${indexName} ON ${tableName} (${columns});`;

    return { up: [dropSQL], down: [createSQL] };
  }

  private generateAddForeignKey(change: SchemaChange): { up: string[]; down: string[] } {
    const { foreignKey } = change.details;
    const tableName = this.quote(change.table);
    const fkName = this.quote(foreignKey.name);
    const column = this.quote(foreignKey.column);
    const refTable = this.quote(foreignKey.referencedTable);
    const refColumn = this.quote(foreignKey.referencedColumn);

    let onDelete = '';
    let onUpdate = '';

    if (foreignKey.onDelete) {
      onDelete = ` ON DELETE ${foreignKey.onDelete}`;
    }
    if (foreignKey.onUpdate) {
      onUpdate = ` ON UPDATE ${foreignKey.onUpdate}`;
    }

    const addSQL =
      this.dialect === 'sqlite'
        ? `-- SQLite doesn't support ADD CONSTRAINT, define foreign keys in CREATE TABLE`
        : `ALTER TABLE ${tableName} ADD CONSTRAINT ${fkName} FOREIGN KEY (${column}) REFERENCES ${refTable}(${refColumn})${onDelete}${onUpdate};`;

    const dropSQL =
      this.dialect === 'sqlite'
        ? `-- SQLite doesn't support DROP CONSTRAINT`
        : `ALTER TABLE ${tableName} DROP CONSTRAINT ${fkName};`;

    return { up: [addSQL], down: [dropSQL] };
  }

  private generateDropForeignKey(change: SchemaChange): { up: string[]; down: string[] } {
    const { foreignKey } = change.details;
    const tableName = this.quote(change.table);
    const fkName = this.quote(foreignKey.name);
    const column = this.quote(foreignKey.column);
    const refTable = this.quote(foreignKey.referencedTable);
    const refColumn = this.quote(foreignKey.referencedColumn);

    let onDelete = '';
    let onUpdate = '';

    if (foreignKey.onDelete) {
      onDelete = ` ON DELETE ${foreignKey.onDelete}`;
    }
    if (foreignKey.onUpdate) {
      onUpdate = ` ON UPDATE ${foreignKey.onUpdate}`;
    }

    const dropSQL =
      this.dialect === 'sqlite'
        ? `-- SQLite doesn't support DROP CONSTRAINT`
        : `ALTER TABLE ${tableName} DROP CONSTRAINT ${fkName};`;

    const addSQL =
      this.dialect === 'sqlite'
        ? `-- SQLite doesn't support ADD CONSTRAINT, define foreign keys in CREATE TABLE`
        : `ALTER TABLE ${tableName} ADD CONSTRAINT ${fkName} FOREIGN KEY (${column}) REFERENCES ${refTable}(${refColumn})${onDelete}${onUpdate};`;

    return { up: [dropSQL], down: [addSQL] };
  }

  private generateColumnDefinition(column: TableColumn): string {
    const name = this.quote(column.name);
    const type = this.getColumnType(column);
    const notNull = column.notNull ? ' NOT NULL' : '';
    const primaryKey = column.primaryKey && !column.autoIncrement ? ' PRIMARY KEY' : '';
    const defaultValue = column.defaultValue ? ` DEFAULT ${column.defaultValue}` : '';

    let autoIncrement = '';
    if (column.autoIncrement) {
      if (this.dialect === 'postgresql') {
        return `${name} SERIAL PRIMARY KEY`;
      } else if (this.dialect === 'mysql') {
        autoIncrement = ' AUTO_INCREMENT PRIMARY KEY';
      } else {
        // SQLite
        return `${name} INTEGER PRIMARY KEY AUTOINCREMENT`;
      }
    }

    return `${name} ${type}${notNull}${primaryKey}${autoIncrement}${defaultValue}`;
  }

  private getColumnType(column: TableColumn): string {
    // Map normalized types to dialect-specific types
    const type = column.type.toLowerCase();

    if (this.dialect === 'postgresql') {
      const pgTypes: Record<string, string> = {
        integer: 'INTEGER',
        bigint: 'BIGINT',
        smallint: 'SMALLINT',
        varchar: 'VARCHAR(255)',
        text: 'TEXT',
        boolean: 'BOOLEAN',
        timestamp: 'TIMESTAMP',
        timestamptz: 'TIMESTAMPTZ',
        date: 'DATE',
        time: 'TIME',
        json: 'JSON',
        jsonb: 'JSONB',
        uuid: 'UUID',
        real: 'REAL',
        double: 'DOUBLE PRECISION',
        decimal: 'DECIMAL',
      };
      return pgTypes[type] || type.toUpperCase();
    } else if (this.dialect === 'mysql') {
      const mysqlTypes: Record<string, string> = {
        integer: 'INT',
        bigint: 'BIGINT',
        smallint: 'SMALLINT',
        varchar: 'VARCHAR(255)',
        text: 'TEXT',
        boolean: 'BOOLEAN',
        timestamp: 'TIMESTAMP',
        datetime: 'DATETIME',
        date: 'DATE',
        json: 'JSON',
        real: 'FLOAT',
        double: 'DOUBLE',
        decimal: 'DECIMAL',
      };
      return mysqlTypes[type] || type.toUpperCase();
    } else {
      // SQLite
      const sqliteTypes: Record<string, string> = {
        integer: 'INTEGER',
        bigint: 'INTEGER',
        smallint: 'INTEGER',
        varchar: 'TEXT',
        text: 'TEXT',
        boolean: 'INTEGER',
        timestamp: 'TEXT',
        date: 'TEXT',
        json: 'TEXT',
        real: 'REAL',
        double: 'REAL',
        decimal: 'REAL',
        blob: 'BLOB',
      };
      return sqliteTypes[type] || 'TEXT';
    }
  }

  private quote(identifier: string): string {
    if (this.dialect === 'postgresql') {
      return `"${identifier}"`;
    } else if (this.dialect === 'mysql') {
      return `\`${identifier}\``;
    } else {
      return `"${identifier}"`;
    }
  }
}
