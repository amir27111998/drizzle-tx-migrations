/**
 * Consolidated type normalization utilities for drizzle-tx-migrations
 *
 * This module provides a single source of truth for database type mappings
 * across PostgreSQL, MySQL, and SQLite dialects.
 */

import type { DbDialect } from '../types';

/**
 * PostgreSQL type mappings
 */
export const POSTGRESQL_TYPE_MAP: Record<string, string> = {
  // String types
  'character varying': 'varchar',
  character: 'char',
  text: 'text',
  // Numeric types
  bigint: 'bigint',
  integer: 'integer',
  smallint: 'smallint',
  real: 'real',
  'double precision': 'double',
  numeric: 'numeric',
  decimal: 'decimal',
  // Boolean
  boolean: 'boolean',
  // Date/Time types
  'timestamp without time zone': 'timestamp',
  'timestamp with time zone': 'timestamptz',
  date: 'date',
  time: 'time',
  'time without time zone': 'time',
  'time with time zone': 'timetz',
  interval: 'interval',
  // JSON types
  json: 'json',
  jsonb: 'jsonb',
  // UUID
  uuid: 'uuid',
  // Binary types
  bytea: 'bytea',
  // Network types
  inet: 'inet',
  cidr: 'cidr',
  macaddr: 'macaddr',
  macaddr8: 'macaddr8',
  // Geometric types
  point: 'point',
  line: 'line',
  lseg: 'lseg',
  box: 'box',
  path: 'path',
  polygon: 'polygon',
  circle: 'circle',
  // Range types
  int4range: 'int4range',
  int8range: 'int8range',
  numrange: 'numrange',
  tsrange: 'tsrange',
  tstzrange: 'tstzrange',
  daterange: 'daterange',
  // Other types
  money: 'money',
  bit: 'bit',
  'bit varying': 'varbit',
  xml: 'xml',
  tsvector: 'tsvector',
  tsquery: 'tsquery',
};

/**
 * MySQL type mappings
 */
export const MYSQL_TYPE_MAP: Record<string, string> = {
  // String types
  varchar: 'varchar',
  char: 'char',
  text: 'text',
  tinytext: 'tinytext',
  mediumtext: 'mediumtext',
  longtext: 'longtext',
  // Numeric types
  int: 'int',
  integer: 'int',
  bigint: 'bigint',
  tinyint: 'tinyint',
  smallint: 'smallint',
  mediumint: 'mediumint',
  float: 'float',
  double: 'double',
  decimal: 'decimal',
  numeric: 'numeric',
  // Boolean
  boolean: 'boolean',
  bool: 'boolean',
  // Date/Time types
  datetime: 'datetime',
  timestamp: 'timestamp',
  date: 'date',
  time: 'time',
  year: 'year',
  // JSON
  json: 'json',
  // Binary types
  binary: 'binary',
  varbinary: 'varbinary',
  blob: 'blob',
  tinyblob: 'tinyblob',
  mediumblob: 'mediumblob',
  longblob: 'longblob',
  // Enum and Set
  enum: 'enum',
  set: 'set',
  // Bit
  bit: 'bit',
};

/**
 * Drizzle SQL type mappings (for schema loader)
 * This maps Drizzle's getSQLType() output to normalized types
 */
export const DRIZZLE_TYPE_MAP: Record<string, string> = {
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

/**
 * Types that support length/precision specifications
 */
export const TYPES_WITH_LENGTH = [
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
] as const;

/**
 * Normalize a PostgreSQL type from database introspection
 */
export function normalizePostgreSQLType(type: string): string {
  return POSTGRESQL_TYPE_MAP[type] || type;
}

/**
 * Normalize a MySQL type from database introspection
 */
export function normalizeMySQLType(type: string): string {
  return MYSQL_TYPE_MAP[type] || type;
}

/**
 * Normalize a SQLite type using SQLite's type affinity rules
 */
export function normalizeSQLiteType(type: string): string {
  const typeUpper = type.toUpperCase();

  // INTEGER affinity
  if (typeUpper.includes('INT')) return 'integer';

  // TEXT affinity
  if (
    typeUpper.includes('CHAR') ||
    typeUpper.includes('TEXT') ||
    typeUpper.includes('CLOB') ||
    typeUpper.includes('VARCHAR') ||
    typeUpper.includes('VARYING')
  ) {
    return 'text';
  }

  // REAL affinity
  if (
    typeUpper.includes('REAL') ||
    typeUpper.includes('FLOA') ||
    typeUpper.includes('DOUB') ||
    typeUpper.includes('NUMERIC') ||
    typeUpper.includes('DECIMAL')
  ) {
    return 'real';
  }

  // BLOB affinity (no type or BLOB)
  if (typeUpper.includes('BLOB') || typeUpper === '' || typeUpper.includes('BINARY')) {
    return 'blob';
  }

  // NUMERIC affinity for everything else that might be boolean, date, etc.
  if (typeUpper.includes('BOOL')) return 'integer';
  if (typeUpper.includes('DATE') || typeUpper.includes('TIME')) return 'text';

  return 'text';
}

/**
 * Normalize a database type based on dialect
 * Used for introspection results
 */
export function normalizeType(type: string, dialect: DbDialect): string {
  switch (dialect) {
    case 'postgresql':
      return normalizePostgreSQLType(type);
    case 'mysql':
      return normalizeMySQLType(type);
    case 'sqlite':
      return normalizeSQLiteType(type);
    default:
      return type;
  }
}

/**
 * Normalize a Drizzle SQL type (from getSQLType())
 * Preserves length/precision information for types that support it
 */
export function normalizeDrizzleType(sqlType: string): string {
  // Extract base type and length/precision
  const match = sqlType.toLowerCase().match(/^([a-z][a-z0-9_ ]*?)(\([^)]*\))?$/);
  if (!match) {
    return sqlType.toLowerCase();
  }

  const baseType = match[1].trim();
  const lengthPrecision = match[2] || '';

  const normalizedBase = DRIZZLE_TYPE_MAP[baseType] || baseType;

  // Preserve length/precision for types that support it
  if (lengthPrecision && TYPES_WITH_LENGTH.includes(normalizedBase as any)) {
    return normalizedBase + lengthPrecision;
  }

  return normalizedBase;
}
