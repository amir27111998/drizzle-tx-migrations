/**
 * Dialect-specific utilities for drizzle-tx-migrations
 */

import type { DbDialect } from '../types';
import { QUOTE_CHARS } from '../constants';

/**
 * Get the quote character for a given dialect
 */
export function getQuoteChar(dialect: DbDialect): string {
  return QUOTE_CHARS[dialect];
}

/**
 * Quote an identifier (table name, column name, etc.) for the given dialect
 */
export function quote(identifier: string, dialect: DbDialect): string {
  const quoteChar = getQuoteChar(dialect);
  return `${quoteChar}${identifier}${quoteChar}`;
}

/**
 * Quote a fully qualified path (e.g., table.column) for the given dialect
 */
export function quotePath(table: string, column: string, dialect: DbDialect): string {
  return `${quote(table, dialect)}.${quote(column, dialect)}`;
}

/**
 * Check if a dialect is valid
 */
export function isValidDialect(dialect: string): dialect is DbDialect {
  return dialect === 'postgresql' || dialect === 'mysql' || dialect === 'sqlite';
}
