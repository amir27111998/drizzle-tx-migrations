import { sql } from 'drizzle-orm';
import type { DbDialect } from './types';

export interface TableColumn {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue?: string;
  primaryKey: boolean;
  autoIncrement?: boolean;
}

export interface TableIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface ForeignKey {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete?: string;
  onUpdate?: string;
}

export interface TableSchema {
  name: string;
  columns: TableColumn[];
  indexes: TableIndex[];
  foreignKeys: ForeignKey[];
  primaryKey: string[];
}

export interface DatabaseSchema {
  tables: Map<string, TableSchema>;
}

export class SchemaIntrospector {
  constructor(
    private db: any,
    private dialect: DbDialect
  ) {}

  async introspect(): Promise<DatabaseSchema> {
    switch (this.dialect) {
      case 'postgresql':
        return this.introspectPostgreSQL();
      case 'mysql':
        return this.introspectMySQL();
      case 'sqlite':
        return this.introspectSQLite();
      default:
        throw new Error(`Unsupported dialect: ${this.dialect}`);
    }
  }

  private async introspectPostgreSQL(): Promise<DatabaseSchema> {
    const tables = new Map<string, TableSchema>();

    // Get all user tables
    const tablesResult = await this.db.execute(sql`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename != '__drizzle_migrations'
    `);

    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.tablename;

      // Get columns
      const columnsResult = await this.db.execute(sql`
        SELECT
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          CASE
            WHEN pk.column_name IS NOT NULL THEN true
            ELSE false
          END as is_primary_key
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT ku.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage ku
            ON tc.constraint_name = ku.constraint_name
            AND tc.table_schema = ku.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = 'public'
            AND tc.table_name = ${tableName}
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_schema = 'public'
          AND c.table_name = ${tableName}
        ORDER BY c.ordinal_position
      `);

      const columns: TableColumn[] = columnsResult.rows.map((col: any) => ({
        name: col.column_name,
        type: this.normalizePostgreSQLType(col.data_type),
        notNull: col.is_nullable === 'NO',
        defaultValue: col.column_default,
        primaryKey: col.is_primary_key,
        autoIncrement: col.column_default?.includes('nextval'),
      }));

      // Get indexes
      const indexesResult = await this.db.execute(sql`
        SELECT
          i.indexname,
          i.indexdef,
          ix.indisunique
        FROM pg_indexes i
        JOIN pg_class c ON c.relname = i.indexname
        JOIN pg_index ix ON ix.indexrelid = c.oid
        WHERE i.tablename = ${tableName}
          AND i.schemaname = 'public'
      `);

      const indexes: TableIndex[] = indexesResult.rows
        .filter((idx: any) => !idx.indexname.endsWith('_pkey'))
        .map((idx: any) => {
          const match = idx.indexdef.match(/\(([^)]+)\)/);
          const columnNames = match ? match[1].split(',').map((c: string) => c.trim()) : [];
          return {
            name: idx.indexname,
            columns: columnNames,
            unique: idx.indisunique,
          };
        });

      // Get foreign keys
      const fkResult = await this.db.execute(sql`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.update_rule,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name
          AND rc.constraint_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = ${tableName}
      `);

      const foreignKeys: ForeignKey[] = fkResult.rows.map((fk: any) => ({
        name: fk.constraint_name,
        column: fk.column_name,
        referencedTable: fk.foreign_table_name,
        referencedColumn: fk.foreign_column_name,
        onDelete: fk.delete_rule !== 'NO ACTION' ? fk.delete_rule : undefined,
        onUpdate: fk.update_rule !== 'NO ACTION' ? fk.update_rule : undefined,
      }));

      const primaryKey = columns.filter((c) => c.primaryKey).map((c) => c.name);

      tables.set(tableName, {
        name: tableName,
        columns,
        indexes,
        foreignKeys,
        primaryKey,
      });
    }

    return { tables };
  }

  private async introspectMySQL(): Promise<DatabaseSchema> {
    const tables = new Map<string, TableSchema>();

    // Get database name
    const dbResult = await this.db.execute(sql`SELECT DATABASE() as db_name`);
    const dbName = dbResult.rows?.[0]?.db_name || dbResult[0]?.[0]?.db_name || dbResult[0]?.db_name;

    // Get all tables (using raw SQL to avoid parameter interpolation issues)
    const tablesQuery = `
      SELECT TABLE_NAME as table_name
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = '${dbName}'
      AND TABLE_NAME != '__drizzle_migrations'
    `;
    const tablesResult = await this.db.execute(sql.raw(tablesQuery));

    // MySQL2 returns [rows[], metadata], so we need the first element
    const tableRows = tablesResult.rows || tablesResult[0] || tablesResult;

    for (const tableRow of tableRows) {
      const tableName = tableRow.table_name || tableRow.TABLE_NAME;

      // Get columns (using raw SQL)
      const columnsQuery = `
        SELECT
          COLUMN_NAME as column_name,
          DATA_TYPE as data_type,
          IS_NULLABLE as is_nullable,
          COLUMN_DEFAULT as column_default,
          COLUMN_KEY as column_key,
          EXTRA as extra
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = '${dbName}'
          AND TABLE_NAME = '${tableName}'
        ORDER BY ORDINAL_POSITION
      `;
      const columnsResult = await this.db.execute(sql.raw(columnsQuery));

      // MySQL2 returns [rows[], metadata], so we need the first element
      const columnRows = columnsResult.rows || columnsResult[0] || columnsResult;
      const columns: TableColumn[] = columnRows.map((col: any) => ({
        name: col.column_name || col.COLUMN_NAME,
        type: this.normalizeMySQLType(col.data_type || col.DATA_TYPE),
        notNull: (col.is_nullable || col.IS_NULLABLE) === 'NO',
        defaultValue: col.column_default || col.COLUMN_DEFAULT,
        primaryKey: (col.column_key || col.COLUMN_KEY) === 'PRI',
        autoIncrement: (col.extra || col.EXTRA)?.includes('auto_increment'),
      }));

      // Get indexes (using raw SQL)
      const indexesQuery = `
        SELECT
          INDEX_NAME as index_name,
          COLUMN_NAME as column_name,
          NON_UNIQUE as non_unique
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = '${dbName}'
          AND TABLE_NAME = '${tableName}'
          AND INDEX_NAME != 'PRIMARY'
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
      `;
      const indexesResult = await this.db.execute(sql.raw(indexesQuery));

      // MySQL2 returns [rows[], metadata], so we need the first element
      const indexRows = indexesResult.rows || indexesResult[0] || indexesResult;
      const indexMap = new Map<string, { columns: string[]; unique: boolean }>();

      for (const idx of indexRows) {
        const indexName = idx.index_name || idx.INDEX_NAME;
        const columnName = idx.column_name || idx.COLUMN_NAME;
        const nonUnique = idx.non_unique !== undefined ? idx.non_unique : idx.NON_UNIQUE;

        if (!indexMap.has(indexName)) {
          // nonUnique is 0 for unique indexes, 1 for non-unique
          indexMap.set(indexName, { columns: [], unique: Number(nonUnique) === 0 });
        }
        indexMap.get(indexName)!.columns.push(columnName);
      }

      const indexes: TableIndex[] = Array.from(indexMap.entries()).map(([name, data]) => ({
        name,
        columns: data.columns,
        unique: data.unique,
      }));

      // Get foreign keys (using raw SQL)
      const fkQuery = `
        SELECT
          CONSTRAINT_NAME as constraint_name,
          COLUMN_NAME as column_name,
          REFERENCED_TABLE_NAME as referenced_table,
          REFERENCED_COLUMN_NAME as referenced_column
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = '${dbName}'
          AND TABLE_NAME = '${tableName}'
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `;
      const fkResult = await this.db.execute(sql.raw(fkQuery));

      // MySQL2 returns [rows[], metadata], so we need the first element
      const fkRows = fkResult.rows || fkResult[0] || fkResult;
      const foreignKeys: ForeignKey[] = fkRows.map((fk: any) => ({
        name: fk.constraint_name || fk.CONSTRAINT_NAME,
        column: fk.column_name || fk.COLUMN_NAME,
        referencedTable: fk.referenced_table || fk.REFERENCED_TABLE_NAME,
        referencedColumn: fk.referenced_column || fk.REFERENCED_COLUMN_NAME,
      }));

      const primaryKey = columns.filter((c) => c.primaryKey).map((c) => c.name);

      tables.set(tableName, {
        name: tableName,
        columns,
        indexes,
        foreignKeys,
        primaryKey,
      });
    }

    return { tables };
  }

  private async introspectSQLite(): Promise<DatabaseSchema> {
    const tables = new Map<string, TableSchema>();

    // Get all tables - SQLite driver returns array directly
    const tablesQuery = `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      AND name != '__drizzle_migrations'
      AND name NOT LIKE 'sqlite_%'
    `;

    const tablesResult = await this.db.all(sql.raw(tablesQuery));

    for (const tableRow of tablesResult) {
      const tableName = tableRow.name;

      // Get table info
      const columnsResult = await this.db.all(sql.raw(`PRAGMA table_info("${tableName}")`));

      const columns: TableColumn[] = columnsResult.map((col: any) => ({
        name: col.name,
        type: this.normalizeSQLiteType(col.type),
        notNull: col.notnull === 1,
        defaultValue: col.dflt_value,
        primaryKey: col.pk === 1,
        autoIncrement: col.pk === 1 && col.type.toUpperCase() === 'INTEGER',
      }));

      // Get indexes
      const indexesResult = await this.db.all(sql.raw(`PRAGMA index_list("${tableName}")`));

      const indexes: TableIndex[] = [];
      for (const idx of indexesResult) {
        if (idx.origin !== 'pk') {
          const indexInfo = await this.db.all(sql.raw(`PRAGMA index_info("${idx.name}")`));
          const columnNames = indexInfo.map((info: any) => info.name);
          indexes.push({
            name: idx.name,
            columns: columnNames,
            unique: idx.unique === 1,
          });
        }
      }

      // Get foreign keys
      const fkResult = await this.db.all(sql.raw(`PRAGMA foreign_key_list("${tableName}")`));

      const foreignKeys: ForeignKey[] = fkResult.map((fk: any) => ({
        name: `fk_${tableName}_${fk.from}_${fk.table}`,
        column: fk.from,
        referencedTable: fk.table,
        referencedColumn: fk.to,
        onDelete: fk.on_delete !== 'NO ACTION' ? fk.on_delete : undefined,
        onUpdate: fk.on_update !== 'NO ACTION' ? fk.on_update : undefined,
      }));

      const primaryKey = columns.filter((c) => c.primaryKey).map((c) => c.name);

      tables.set(tableName, {
        name: tableName,
        columns,
        indexes,
        foreignKeys,
        primaryKey,
      });
    }

    return { tables };
  }

  private normalizePostgreSQLType(type: string): string {
    const typeMap: Record<string, string> = {
      'character varying': 'varchar',
      'timestamp without time zone': 'timestamp',
      'timestamp with time zone': 'timestamptz',
      'double precision': 'double',
      bigint: 'bigint',
      integer: 'integer',
      smallint: 'smallint',
      boolean: 'boolean',
      text: 'text',
      json: 'json',
      jsonb: 'jsonb',
      uuid: 'uuid',
      date: 'date',
      time: 'time',
    };
    return typeMap[type] || type;
  }

  private normalizeMySQLType(type: string): string {
    const typeMap: Record<string, string> = {
      varchar: 'varchar',
      int: 'int',
      bigint: 'bigint',
      tinyint: 'tinyint',
      smallint: 'smallint',
      mediumint: 'mediumint',
      text: 'text',
      longtext: 'longtext',
      datetime: 'datetime',
      timestamp: 'timestamp',
      date: 'date',
      boolean: 'boolean',
      json: 'json',
      decimal: 'decimal',
      float: 'float',
      double: 'double',
    };
    return typeMap[type] || type;
  }

  private normalizeSQLiteType(type: string): string {
    const typeUpper = type.toUpperCase();
    if (typeUpper.includes('INT')) return 'integer';
    if (typeUpper.includes('CHAR') || typeUpper.includes('TEXT')) return 'text';
    if (typeUpper.includes('REAL') || typeUpper.includes('FLOA') || typeUpper.includes('DOUB'))
      return 'real';
    if (typeUpper.includes('BLOB')) return 'blob';
    return 'text';
  }
}
