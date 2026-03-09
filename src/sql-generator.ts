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
    // UP order:
    // 1. Drop foreign keys (must happen before dropping referenced tables)
    // 2. Drop indexes
    // 3. Alter tables
    // 4. Drop tables
    // 5. Create tables
    // 6. Create indexes
    // 7. Create foreign keys (must happen after referenced tables exist)
    //
    // DOWN order (reverse of up):
    // We process changes in reverse order and prepend their down statements
    // This ensures proper dependency order for rollback

    const orderedChanges = this.orderChanges(changes);

    // First pass: collect all up statements in order
    for (const change of orderedChanges) {
      const { up } = this.generateChangeSQL(change);
      if (up) upStatements.push(...up);
    }

    // Second pass: collect down statements in REVERSE order of changes
    // Each change's down statements stay in their internal order
    for (let i = orderedChanges.length - 1; i >= 0; i--) {
      const change = orderedChanges[i];
      const { down } = this.generateChangeSQL(change);
      if (down) downStatements.push(...down);
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
    // Use CASCADE for PostgreSQL to handle foreign key dependencies
    const dropSQL =
      this.dialect === 'postgresql'
        ? `DROP TABLE IF EXISTS ${tableName} CASCADE;`
        : `DROP TABLE IF EXISTS ${tableName};`;

    return {
      up: [createSQL],
      down: [dropSQL],
    };
  }

  private generateDropTable(change: SchemaChange): { up: string[]; down: string[] } {
    const { tableSchema } = change.details;
    const tableName = this.quote(change.table);

    const dropSQL = `DROP TABLE IF EXISTS ${tableName};`;

    // For down migration, recreate the table with its columns, indexes, and foreign keys
    const downStatements: string[] = [];

    // 1. Create the table with columns
    const columnDefs = tableSchema.columns.map((col: TableColumn) =>
      this.generateColumnDefinition(col)
    );

    if (tableSchema.primaryKey.length > 1) {
      const pkCols = tableSchema.primaryKey.map((c: string) => this.quote(c)).join(', ');
      columnDefs.push(`PRIMARY KEY (${pkCols})`);
    }

    const createSQL = `CREATE TABLE ${tableName} (\n  ${columnDefs.join(',\n  ')}\n);`;
    downStatements.push(createSQL);

    // 2. Recreate indexes
    if (tableSchema.indexes && tableSchema.indexes.length > 0) {
      for (const index of tableSchema.indexes) {
        const indexName = this.quote(index.name);
        const columns = index.columns.map((c: string) => this.quote(c)).join(', ');
        const unique = index.unique ? 'UNIQUE ' : '';
        downStatements.push(`CREATE ${unique}INDEX ${indexName} ON ${tableName} (${columns});`);
      }
    }

    // 3. Recreate foreign keys
    if (tableSchema.foreignKeys && tableSchema.foreignKeys.length > 0) {
      for (const fk of tableSchema.foreignKeys) {
        const fkName = this.quote(fk.name);
        const column = this.quote(fk.column);
        const refTable = this.quote(fk.referencedTable);
        const refColumn = this.quote(fk.referencedColumn);
        let onDelete = '';
        let onUpdate = '';
        if (fk.onDelete) onDelete = ` ON DELETE ${fk.onDelete}`;
        if (fk.onUpdate) onUpdate = ` ON UPDATE ${fk.onUpdate}`;

        if (this.dialect !== 'sqlite') {
          downStatements.push(
            `ALTER TABLE ${tableName} ADD CONSTRAINT ${fkName} FOREIGN KEY (${column}) REFERENCES ${refTable}(${refColumn})${onDelete}${onUpdate};`
          );
        }
      }
    }

    return {
      up: [dropSQL],
      down: downStatements,
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

    if (this.dialect === 'postgresql') {
      // PostgreSQL requires separate ALTER commands for different attributes
      return `ALTER TABLE ${table} ALTER COLUMN ${colName} TYPE ${this.getColumnType(column)};`;
    } else if (this.dialect === 'mysql') {
      // For MODIFY COLUMN, we need to exclude PRIMARY KEY to avoid "Multiple primary key" error
      const colDef = this.generateColumnDefinitionForModify(column);
      return `ALTER TABLE ${table} MODIFY COLUMN ${colDef};`;
    } else {
      // SQLite doesn't support ALTER COLUMN
      return `-- SQLite doesn't support MODIFY COLUMN natively, manual migration required`;
    }
  }

  /**
   * Generate column definition for MODIFY COLUMN (excludes PRIMARY KEY)
   * This is needed because MySQL doesn't allow redefining PRIMARY KEY in MODIFY COLUMN
   */
  private generateColumnDefinitionForModify(column: TableColumn): string {
    const name = this.quote(column.name);
    const type = this.getColumnType(column);
    const notNull = column.notNull ? ' NOT NULL' : '';
    const defaultValue = this.formatDefaultValue(column.defaultValue);

    let autoIncrement = '';
    if (column.autoIncrement) {
      if (this.dialect === 'mysql') {
        autoIncrement = ' AUTO_INCREMENT';
      }
    }

    return `${name} ${type}${notNull}${autoIncrement}${defaultValue}`;
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
    const defaultValue = this.formatDefaultValue(column.defaultValue);

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

  private formatDefaultValue(defaultValue: string | undefined): string {
    if (!defaultValue) {
      return '';
    }

    // Handle [object Object] - this means the value wasn't properly extracted
    // Treat it as a function call (CURRENT_TIMESTAMP)
    if (defaultValue.includes('[object Object]')) {
      if (this.dialect === 'postgresql') {
        return ' DEFAULT CURRENT_TIMESTAMP';
      } else if (this.dialect === 'mysql') {
        return ' DEFAULT CURRENT_TIMESTAMP';
      } else {
        return ' DEFAULT CURRENT_TIMESTAMP';
      }
    }

    // Handle function calls like 'fn()', 'now()', etc.
    if (
      defaultValue === 'fn()' ||
      defaultValue.includes('now()') ||
      defaultValue.includes('CURRENT_TIMESTAMP')
    ) {
      if (this.dialect === 'postgresql') {
        return ' DEFAULT CURRENT_TIMESTAMP';
      } else if (this.dialect === 'mysql') {
        return ' DEFAULT CURRENT_TIMESTAMP';
      } else {
        return ' DEFAULT CURRENT_TIMESTAMP';
      }
    }

    // Handle boolean values
    if (defaultValue === 'true' || defaultValue === 'false') {
      if (this.dialect === 'postgresql') {
        return ` DEFAULT ${defaultValue}`;
      } else if (this.dialect === 'mysql') {
        return ` DEFAULT ${defaultValue === 'true' ? '1' : '0'}`;
      } else {
        return ` DEFAULT ${defaultValue === 'true' ? '1' : '0'}`;
      }
    }

    // Handle NULL
    if (defaultValue.toLowerCase() === 'null') {
      return ' DEFAULT NULL';
    }

    // Handle numeric values
    if (/^-?\d+(\.\d+)?$/.test(defaultValue)) {
      return ` DEFAULT ${defaultValue}`;
    }

    // Handle strings - quote them
    if (!defaultValue.startsWith("'") && !defaultValue.startsWith('"')) {
      return ` DEFAULT '${defaultValue.replace(/'/g, "''")}'`;
    }

    // Already quoted or special SQL syntax
    return ` DEFAULT ${defaultValue}`;
  }

  private getColumnType(column: TableColumn): string {
    // Map normalized types to dialect-specific types
    const type = column.type.toLowerCase();

    // Check if type already includes length/precision (e.g., varchar(36))
    const match = type.match(/^([a-z]+)(\([^)]*\))?$/);
    const baseType = match ? match[1] : type;
    const lengthPrecision = match ? match[2] || '' : '';

    if (this.dialect === 'postgresql') {
      const pgTypes: Record<string, string> = {
        integer: 'INTEGER',
        bigint: 'BIGINT',
        smallint: 'SMALLINT',
        varchar: 'VARCHAR',
        char: 'CHAR',
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
        numeric: 'NUMERIC',
      };
      const mappedType = pgTypes[baseType] || baseType.toUpperCase();
      // Add default length for varchar/char if not specified
      if ((baseType === 'varchar' || baseType === 'char') && !lengthPrecision) {
        return `${mappedType}(255)`;
      }
      return mappedType + lengthPrecision.toUpperCase();
    } else if (this.dialect === 'mysql') {
      const mysqlTypes: Record<string, string> = {
        integer: 'INT',
        bigint: 'BIGINT',
        smallint: 'SMALLINT',
        varchar: 'VARCHAR',
        char: 'CHAR',
        text: 'TEXT',
        boolean: 'BOOLEAN',
        timestamp: 'TIMESTAMP',
        datetime: 'DATETIME',
        date: 'DATE',
        json: 'JSON',
        real: 'FLOAT',
        double: 'DOUBLE',
        decimal: 'DECIMAL',
        numeric: 'NUMERIC',
      };
      const mappedType = mysqlTypes[baseType] || baseType.toUpperCase();
      // Add default length for varchar/char if not specified
      if ((baseType === 'varchar' || baseType === 'char') && !lengthPrecision) {
        return `${mappedType}(255)`;
      }
      return mappedType + lengthPrecision.toUpperCase();
    } else {
      // SQLite
      const sqliteTypes: Record<string, string> = {
        integer: 'INTEGER',
        bigint: 'INTEGER',
        smallint: 'INTEGER',
        varchar: 'TEXT',
        char: 'TEXT',
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
      return sqliteTypes[baseType] || 'TEXT';
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
