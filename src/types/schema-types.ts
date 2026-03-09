/**
 * Centralized schema type definitions for drizzle-tx-migrations
 */

/** Represents a column in a database table */
export interface TableColumn {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue?: string;
  primaryKey: boolean;
  autoIncrement?: boolean;
}

/** Represents an index on a database table */
export interface TableIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

/** Represents a foreign key constraint */
export interface ForeignKey {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete?: string;
  onUpdate?: string;
}

/** Represents the complete schema of a database table */
export interface TableSchema {
  name: string;
  columns: TableColumn[];
  indexes: TableIndex[];
  foreignKeys: ForeignKey[];
  primaryKey: string[];
}

/** Represents the complete database schema */
export interface DatabaseSchema {
  tables: Map<string, TableSchema>;
}

/** Types of schema changes that can be detected */
export type SchemaChangeType =
  | 'create_table'
  | 'drop_table'
  | 'alter_table'
  | 'create_index'
  | 'drop_index'
  | 'add_foreign_key'
  | 'drop_foreign_key';

/** Represents a change detected in the schema */
export interface SchemaChange {
  type: SchemaChangeType;
  table: string;
  details?: any;
}

/** Types of table-level changes */
export type TableChangeType = 'add_column' | 'drop_column' | 'modify_column';

/** Represents a change within a table */
export interface TableChange {
  type: TableChangeType;
  column: string;
  details?: any;
}
