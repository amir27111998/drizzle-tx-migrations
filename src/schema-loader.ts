import * as path from 'path';
import type { DbDialect } from './types';
import type {
  DatabaseSchema,
  TableSchema,
  TableColumn,
  TableIndex,
  ForeignKey,
} from './schema-introspector';

export class SchemaLoader {
  constructor(
    private schemaFiles: string[],
    private dialect: DbDialect
  ) {}

  async loadSchema(): Promise<DatabaseSchema> {
    const tables = new Map<string, TableSchema>();

    // Import all schema files
    const { createJiti } = await import('jiti');
    const jiti = createJiti(process.cwd(), {
      interopDefault: true,
    });

    const allImports: Record<string, unknown> = {};

    for (const schemaFile of this.schemaFiles) {
      const absolutePath = path.isAbsolute(schemaFile)
        ? schemaFile
        : path.resolve(process.cwd(), schemaFile);

      const imported = jiti(absolutePath);
      Object.assign(allImports, imported);
    }

    // Parse Drizzle table definitions
    for (const [_exportName, exportValue] of Object.entries(allImports)) {
      if (this.isDrizzleTable(exportValue)) {
        const tableSchema = this.parseTable(exportValue);
        if (tableSchema) {
          tables.set(tableSchema.name, tableSchema);
        }
      }
    }

    return { tables };
  }

  private isDrizzleTable(value: any): boolean {
    // Check if it's a Drizzle table by looking for specific properties
    // Drizzle tables have a Symbol key for table metadata
    if (!value || typeof value !== 'object') return false;

    // Check for common Drizzle table properties
    const hasTableSymbol = Object.getOwnPropertySymbols(value).some(
      (sym) => sym.toString() === 'Symbol(drizzle:Name)' || sym.toString().includes('drizzle')
    );

    // Also check for the table structure
    const hasTableStructure =
      value[Symbol.for('drizzle:Name')] !== undefined ||
      (value._ && typeof value._.name === 'string' && typeof value._.columns === 'object');

    return hasTableSymbol || hasTableStructure;
  }

  private parseTable(table: any): TableSchema | null {
    try {
      // Extract table name
      const tableName =
        table[Symbol.for('drizzle:Name')] || table._.name || table.dbName || table.name;

      if (!tableName) return null;

      const columns: TableColumn[] = [];
      const indexes: TableIndex[] = [];
      const foreignKeys: ForeignKey[] = [];
      const primaryKeyColumns: string[] = [];

      // Parse columns
      const columnsObj = table._?.columns || table.columns || {};

      for (const [colName, colDef] of Object.entries(columnsObj)) {
        if (!this.isDrizzleColumn(colDef)) continue;

        const column = this.parseColumn(colName, colDef as any);
        if (column) {
          columns.push(column);
          if (column.primaryKey) {
            primaryKeyColumns.push(column.name);
          }
        }
      }

      // Parse indexes
      if (table._?.indexes || table.indexes) {
        const indexesObj = table._?.indexes || table.indexes;
        for (const [indexName, indexDef] of Object.entries(indexesObj)) {
          const index = this.parseIndex(indexName, indexDef as any);
          if (index) {
            indexes.push(index);
          }
        }
      }

      // Parse foreign keys
      if (table._?.foreignKeys || table.foreignKeys) {
        const foreignKeysObj = table._?.foreignKeys || table.foreignKeys;
        for (const [fkName, fkDef] of Object.entries(foreignKeysObj)) {
          const fk = this.parseForeignKey(fkName, fkDef as any);
          if (fk) {
            foreignKeys.push(fk);
          }
        }
      }

      return {
        name: tableName,
        columns,
        indexes,
        foreignKeys,
        primaryKey: primaryKeyColumns,
      };
    } catch (error) {
      console.warn('Failed to parse table:', error);
      return null;
    }
  }

  private isDrizzleColumn(value: any): boolean {
    if (!value || typeof value !== 'object') return false;

    // Check for column-specific properties
    return (
      value.dataType !== undefined ||
      value.columnType !== undefined ||
      (value._ && typeof value._.dataType === 'string')
    );
  }

  private parseColumn(name: string, colDef: any): TableColumn | null {
    try {
      const columnName = colDef.name || name;
      const dataType = colDef._?.dataType || colDef.dataType || colDef.columnType || 'text';

      return {
        name: columnName,
        type: this.normalizeType(dataType),
        notNull: colDef.notNull === true || colDef._?.notNull === true,
        defaultValue: colDef.default || colDef._?.default,
        primaryKey: colDef.primary === true || colDef._?.primary === true,
        autoIncrement:
          colDef.autoIncrement === true ||
          colDef._?.autoIncrement === true ||
          (this.dialect === 'postgresql' && dataType === 'serial'),
      };
    } catch (error) {
      console.warn(`Failed to parse column ${name}:`, error);
      return null;
    }
  }

  private parseIndex(name: string, indexDef: any): TableIndex | null {
    try {
      const columns = Array.isArray(indexDef.columns)
        ? indexDef.columns.map((c: any) => (typeof c === 'string' ? c : c.name))
        : [];

      return {
        name: indexDef.name || name,
        columns,
        unique: indexDef.unique === true,
      };
    } catch (error) {
      console.warn(`Failed to parse index ${name}:`, error);
      return null;
    }
  }

  private parseForeignKey(name: string, fkDef: any): ForeignKey | null {
    try {
      const columns = Array.isArray(fkDef.columns) ? fkDef.columns : [fkDef.columns];
      const refColumns = Array.isArray(fkDef.foreignColumns)
        ? fkDef.foreignColumns
        : [fkDef.foreignColumns];

      return {
        name: fkDef.name || name,
        column: columns[0]?.name || columns[0],
        referencedTable: fkDef.foreignTable?._?.name || fkDef.foreignTable,
        referencedColumn: refColumns[0]?.name || refColumns[0],
        onDelete: fkDef.onDelete,
        onUpdate: fkDef.onUpdate,
      };
    } catch (error) {
      console.warn(`Failed to parse foreign key ${name}:`, error);
      return null;
    }
  }

  private normalizeType(type: string): string {
    // Normalize common type aliases
    const typeMap: Record<string, string> = {
      serial: 'integer',
      bigserial: 'bigint',
      varchar: 'varchar',
      char: 'char',
      text: 'text',
      integer: 'integer',
      int: 'integer',
      bigint: 'bigint',
      smallint: 'smallint',
      boolean: 'boolean',
      bool: 'boolean',
      timestamp: 'timestamp',
      timestamptz: 'timestamptz',
      date: 'date',
      time: 'time',
      json: 'json',
      jsonb: 'jsonb',
      uuid: 'uuid',
      real: 'real',
      double: 'double',
      decimal: 'decimal',
      blob: 'blob',
    };

    const normalized = type.toLowerCase().replace(/\([^)]*\)/g, ''); // Remove length specifiers
    return typeMap[normalized] || normalized;
  }
}
