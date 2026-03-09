import * as path from 'path';
import * as fs from 'fs';
import { is } from 'drizzle-orm';
import { PgTable, getTableConfig as getPgTableConfig } from 'drizzle-orm/pg-core';
import { MySqlTable, getTableConfig as getMysqlTableConfig } from 'drizzle-orm/mysql-core';
import { SQLiteTable, getTableConfig as getSqliteTableConfig } from 'drizzle-orm/sqlite-core';
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

    // Expand schema files (handle directories and glob patterns)
    const expandedFiles = await this.expandSchemaFiles(this.schemaFiles);

    if (expandedFiles.length === 0) {
      console.warn('No schema files found');
      return { tables };
    }

    console.log(`Loading ${expandedFiles.length} schema file(s)`);

    // Import all schema files
    const { createJiti } = await import('jiti');
    const jiti = createJiti(process.cwd(), {
      interopDefault: true,
    });

    const allImports: Record<string, unknown> = {};

    for (const schemaFile of expandedFiles) {
      const absolutePath = path.isAbsolute(schemaFile)
        ? schemaFile
        : path.resolve(process.cwd(), schemaFile);

      try {
        const imported = jiti(absolutePath);
        Object.assign(allImports, imported);
      } catch (error) {
        console.warn(`Failed to load schema file ${schemaFile}:`, error);
      }
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

  /**
   * Expand schema file paths to handle directories and glob patterns
   * - If path is a directory, recursively find all .ts files
   * - If path contains glob patterns (* or **), expand using glob
   * - Otherwise, treat as a single file path
   */
  private async expandSchemaFiles(schemaPaths: string[]): Promise<string[]> {
    const expandedFiles: string[] = [];

    for (const schemaPath of schemaPaths) {
      const absolutePath = path.isAbsolute(schemaPath)
        ? schemaPath
        : path.resolve(process.cwd(), schemaPath);

      // Check if path contains glob patterns
      if (schemaPath.includes('*')) {
        // Use glob pattern matching
        const globFiles = await this.expandGlobPattern(schemaPath);
        expandedFiles.push(...globFiles);
      } else if (fs.existsSync(absolutePath)) {
        const stats = fs.statSync(absolutePath);

        if (stats.isDirectory()) {
          // Recursively find all .ts files in directory
          const dirFiles = this.findSchemaFilesInDirectory(absolutePath);
          expandedFiles.push(...dirFiles);
        } else if (
          stats.isFile() &&
          (absolutePath.endsWith('.ts') || absolutePath.endsWith('.js'))
        ) {
          // Single file
          expandedFiles.push(absolutePath);
        }
      } else {
        console.warn(`Schema path not found: ${schemaPath}`);
      }
    }

    // Remove duplicates and sort
    return [...new Set(expandedFiles)].sort();
  }

  /**
   * Recursively find all .ts and .js files in a directory
   */
  private findSchemaFilesInDirectory(dirPath: string): string[] {
    const files: string[] = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        // Recursively scan subdirectories
        files.push(...this.findSchemaFilesInDirectory(fullPath));
      } else if (entry.isFile()) {
        // Include .ts and .js files
        if (fullPath.endsWith('.ts') || fullPath.endsWith('.js')) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  /**
   * Expand glob pattern to file paths
   */
  private async expandGlobPattern(pattern: string): Promise<string[]> {
    try {
      // Use fast-glob for better glob support
      const { glob } = await import('glob');
      const files = await glob(pattern, {
        cwd: process.cwd(),
        absolute: true,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
      });
      return files.filter((f) => f.endsWith('.ts') || f.endsWith('.js'));
    } catch (error) {
      console.warn(`Failed to expand glob pattern ${pattern}:`, error);
      return [];
    }
  }

  private isDrizzleTable(value: any): boolean {
    // Use Drizzle's built-in type guards to check if it's a table
    if (!value || typeof value !== 'object') return false;

    // First try official type guards
    if (is(value, PgTable) || is(value, MySqlTable) || is(value, SQLiteTable)) {
      return true;
    }

    // Fallback: Check for Drizzle table structure (for dynamically loaded modules via jiti)
    // Tables loaded via jiti might not pass is() checks but still have the right structure
    const hasTableName =
      value[Symbol.for('drizzle:Name')] !== undefined ||
      (typeof value._ === 'object' && typeof value._.name === 'string');

    const hasTableColumns = typeof value._ === 'object' && typeof value._.columns === 'object';

    return hasTableName && hasTableColumns;
  }

  private parseTable(table: any): TableSchema | null {
    try {
      // Use Drizzle's official getTableConfig() API to extract table metadata
      // Call the correct getTableConfig based on table type
      let tableConfig: any;

      // Try official type guards first
      if (is(table, PgTable)) {
        tableConfig = getPgTableConfig(table);
      } else if (is(table, MySqlTable)) {
        tableConfig = getMysqlTableConfig(table);
      } else if (is(table, SQLiteTable)) {
        tableConfig = getSqliteTableConfig(table);
      } else {
        // Fallback for dynamically loaded tables - try each getTableConfig
        // This handles cases where is() fails due to jiti loading
        try {
          if (this.dialect === 'postgresql') {
            tableConfig = getPgTableConfig(table);
          } else if (this.dialect === 'mysql') {
            tableConfig = getMysqlTableConfig(table);
          } else if (this.dialect === 'sqlite') {
            tableConfig = getSqliteTableConfig(table);
          }
        } catch (e) {
          console.warn('Failed to get table config:', e);
          return null;
        }
      }

      if (!tableConfig) {
        console.warn('No table config returned');
        return null;
      }

      const {
        name: tableName,
        columns: drizzleColumns,
        indexes: drizzleIndexes,
        foreignKeys: drizzleForeignKeys,
        primaryKeys: drizzlePrimaryKeys,
      } = tableConfig;

      if (!tableName) {
        console.warn('Table config missing name');
        return null;
      }

      const columns: TableColumn[] = [];
      const indexes: TableIndex[] = [];
      const foreignKeys: ForeignKey[] = [];
      const primaryKeyColumns: string[] = [];

      // Parse columns using Drizzle's column objects
      if (!drizzleColumns || !Array.isArray(drizzleColumns)) {
        console.warn(`Table ${tableName}: columns is not an array:`, typeof drizzleColumns);
      } else {
        for (const drizzleColumn of drizzleColumns) {
          const column = this.parseColumnFromDrizzle(drizzleColumn);
          if (column) {
            columns.push(column);
            if (column.primaryKey) {
              primaryKeyColumns.push(column.name);
            }
          }
        }
      }

      // Parse indexes from Drizzle index objects
      for (const [indexName, drizzleIndex] of Object.entries(drizzleIndexes || {})) {
        const index = this.parseIndexFromDrizzle(indexName, drizzleIndex as any);
        if (index) {
          indexes.push(index);
        }
      }

      // Parse foreign keys from Drizzle foreign key objects
      for (const drizzleFk of drizzleForeignKeys || []) {
        const fk = this.parseForeignKeyFromDrizzle(drizzleFk);
        if (fk) {
          foreignKeys.push(fk);
        }
      }

      // Parse composite primary keys
      for (const drizzlePk of drizzlePrimaryKeys || []) {
        const pkColumns = drizzlePk.columns.map((col: any) => col.name);
        primaryKeyColumns.push(...pkColumns.filter((c: string) => !primaryKeyColumns.includes(c)));
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

  /**
   * Parse column from Drizzle column object using official API
   */
  private parseColumnFromDrizzle(drizzleColumn: any): TableColumn | null {
    try {
      const columnName = drizzleColumn.name;
      const sqlType = drizzleColumn.getSQLType();
      const notNull = drizzleColumn.notNull;
      const primaryKey = drizzleColumn.primary;

      // Extract default value
      let defaultValue: string | undefined;
      if (drizzleColumn.hasDefault) {
        if (drizzleColumn.default !== undefined) {
          if (typeof drizzleColumn.default === 'function') {
            const result = drizzleColumn.default();
            // Check if it's an SQL object/fragment
            if (result && typeof result === 'object') {
              // It's likely a SQL fragment, use 'fn()' as placeholder
              defaultValue = 'fn()';
            } else {
              defaultValue = String(result);
            }
          } else {
            defaultValue = String(drizzleColumn.default);
          }
        } else if (drizzleColumn.defaultFn !== undefined) {
          // For $defaultFn, we can't get the actual value, just note it exists
          defaultValue = 'fn()';
        }
      }

      // Detect auto-increment
      const autoIncrement =
        drizzleColumn.autoIncrement === true ||
        drizzleColumn.generated?.type === 'always' ||
        (this.dialect === 'postgresql' && sqlType.toLowerCase().includes('serial'));

      return {
        name: columnName,
        type: this.normalizeSQLType(sqlType),
        notNull,
        defaultValue,
        primaryKey,
        autoIncrement,
      };
    } catch (error) {
      console.warn(`Failed to parse column:`, error);
      return null;
    }
  }

  /**
   * Parse index from Drizzle index object
   */
  private parseIndexFromDrizzle(indexName: string, drizzleIndex: any): TableIndex | null {
    try {
      const columns = drizzleIndex.config?.columns?.map((col: any) => col.name) || [];
      const unique = drizzleIndex.config?.unique === true;

      return {
        name: drizzleIndex.config?.name || indexName,
        columns,
        unique,
      };
    } catch (error) {
      console.warn(`Failed to parse index ${indexName}:`, error);
      return null;
    }
  }

  /**
   * Parse foreign key from Drizzle foreign key object
   */
  private parseForeignKeyFromDrizzle(drizzleFk: any): ForeignKey | null {
    try {
      // Call reference() to get foreign key details
      const reference = drizzleFk.reference ? drizzleFk.reference() : drizzleFk;

      // Extract columns - handle both array and single column
      const localCols = reference.columns || drizzleFk.columns || [];
      const foreignCols = reference.foreignColumns || [];

      if (!localCols.length || !foreignCols.length) {
        console.warn('Foreign key missing columns');
        return null;
      }

      const columns = Array.isArray(localCols)
        ? localCols.map((col: any) => col.name)
        : [localCols.name];

      const refColumns = Array.isArray(foreignCols)
        ? foreignCols.map((col: any) => col.name)
        : [foreignCols.name];

      // Get referenced table name using correct getTableConfig
      const refTable = reference.foreignTable;
      let refTableName: string;

      if (is(refTable, PgTable)) {
        refTableName = getPgTableConfig(refTable).name;
      } else if (is(refTable, MySqlTable)) {
        refTableName = getMysqlTableConfig(refTable).name;
      } else if (is(refTable, SQLiteTable)) {
        refTableName = getSqliteTableConfig(refTable).name;
      } else {
        console.warn('Unknown foreign table type');
        return null;
      }

      // Use custom name if provided (in reference), otherwise generate one
      const fkName = reference.name || `fk_${columns[0]}_${refTableName}`;

      return {
        name: fkName,
        column: columns[0],
        referencedTable: refTableName,
        referencedColumn: refColumns[0],
        // onDelete/onUpdate are on the FK object, not the reference
        onDelete: drizzleFk.onDelete || reference.onDelete,
        onUpdate: drizzleFk.onUpdate || reference.onUpdate,
      };
    } catch (error) {
      console.warn(`Failed to parse foreign key:`, error);
      return null;
    }
  }

  /**
   * Normalize SQL type from Drizzle's getSQLType() to our internal format
   * Preserves length/precision information for types like varchar(36)
   */
  private normalizeSQLType(sqlType: string): string {
    // Normalize common type aliases
    const typeMap: Record<string, string> = {
      // PostgreSQL serial types (auto-increment)
      serial: 'integer',
      serial4: 'integer',
      serial8: 'bigint',
      bigserial: 'bigint',
      smallserial: 'smallint',
      // String types
      varchar: 'varchar',
      'character varying': 'varchar',
      char: 'char',
      character: 'char',
      text: 'text',
      tinytext: 'tinytext',
      mediumtext: 'mediumtext',
      longtext: 'longtext',
      // Numeric types
      integer: 'integer',
      int: 'integer',
      int4: 'integer',
      int8: 'bigint',
      bigint: 'bigint',
      smallint: 'smallint',
      int2: 'smallint',
      tinyint: 'tinyint',
      mediumint: 'mediumint',
      real: 'real',
      float: 'float',
      float4: 'real',
      float8: 'double',
      double: 'double',
      'double precision': 'double',
      decimal: 'decimal',
      numeric: 'numeric',
      money: 'money',
      // Boolean
      boolean: 'boolean',
      bool: 'boolean',
      // Date/Time types
      timestamp: 'timestamp',
      'timestamp without time zone': 'timestamp',
      timestamptz: 'timestamptz',
      'timestamp with time zone': 'timestamptz',
      datetime: 'datetime',
      date: 'date',
      time: 'time',
      'time without time zone': 'time',
      timetz: 'timetz',
      'time with time zone': 'timetz',
      interval: 'interval',
      year: 'year',
      // JSON types
      json: 'json',
      jsonb: 'jsonb',
      // UUID
      uuid: 'uuid',
      // Binary types
      bytea: 'bytea',
      binary: 'binary',
      varbinary: 'varbinary',
      blob: 'blob',
      tinyblob: 'tinyblob',
      mediumblob: 'mediumblob',
      longblob: 'longblob',
      // Network types (PostgreSQL)
      inet: 'inet',
      cidr: 'cidr',
      macaddr: 'macaddr',
      macaddr8: 'macaddr8',
      // Geometric types (PostgreSQL)
      point: 'point',
      line: 'line',
      lseg: 'lseg',
      box: 'box',
      path: 'path',
      polygon: 'polygon',
      circle: 'circle',
      // Range types (PostgreSQL)
      int4range: 'int4range',
      int8range: 'int8range',
      numrange: 'numrange',
      tsrange: 'tsrange',
      tstzrange: 'tstzrange',
      daterange: 'daterange',
      // Bit types
      bit: 'bit',
      'bit varying': 'varbit',
      varbit: 'varbit',
      // Other types
      xml: 'xml',
      tsvector: 'tsvector',
      tsquery: 'tsquery',
      enum: 'enum',
      set: 'set',
    };

    // Extract base type and length/precision
    const match = sqlType.toLowerCase().match(/^([a-z][a-z0-9_ ]*?)(\([^)]*\))?$/);
    if (!match) {
      return sqlType.toLowerCase();
    }

    const baseType = match[1].trim();
    const lengthPrecision = match[2] || '';

    const normalizedBase = typeMap[baseType] || baseType;

    // Preserve length/precision for types that support it
    const typesWithLength = [
      'varchar',
      'char',
      'decimal',
      'numeric',
      'binary',
      'varbinary',
      'bit',
      'varbit',
      'time',
      'timetz',
      'timestamp',
      'timestamptz',
      'interval',
    ];
    if (lengthPrecision && typesWithLength.includes(normalizedBase)) {
      return normalizedBase + lengthPrecision;
    }

    return normalizedBase;
  }
}
