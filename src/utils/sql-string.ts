/**
 * SQL string utilities for drizzle-tx-migrations
 */

import type { DbDialect } from '../types';

/**
 * Escape SQL for use in template literals
 * Escapes backticks and dollar signs that would interfere with template syntax
 */
export function escapeSqlForTemplate(sqlStr: string): string {
  return sqlStr.replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

/**
 * Format a default value for SQL generation
 * Handles different value types and dialect-specific formatting
 */
export function formatDefaultValue(value: string | undefined, dialect: DbDialect): string {
  if (value === undefined || value === null) {
    return '';
  }

  const valueLower = value.toLowerCase();

  // Check for function calls (e.g., NOW(), CURRENT_TIMESTAMP, uuid_generate_v4())
  if (
    valueLower.includes('(') ||
    valueLower === 'current_timestamp' ||
    valueLower === 'current_date' ||
    valueLower === 'current_time'
  ) {
    return ` DEFAULT ${value}`;
  }

  // Check for boolean values
  if (valueLower === 'true' || valueLower === 'false') {
    if (dialect === 'mysql') {
      return ` DEFAULT ${valueLower === 'true' ? '1' : '0'}`;
    }
    return ` DEFAULT ${value.toUpperCase()}`;
  }

  // Check for numeric values
  if (!isNaN(Number(value))) {
    return ` DEFAULT ${value}`;
  }

  // String values - quote them
  const escaped = value.replace(/'/g, "''");
  return ` DEFAULT '${escaped}'`;
}

/**
 * Check if a value looks like a SQL function call
 */
export function isSqlFunction(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes('(') ||
    lower === 'current_timestamp' ||
    lower === 'current_date' ||
    lower === 'current_time' ||
    lower === 'now' ||
    lower === 'null'
  );
}

/**
 * Wrap SQL statements in migration function format
 */
export function wrapStatementsInFunction(
  statements: string[],
  functionName: 'up' | 'down'
): string {
  const body = statements
    .map((stmt) => `  await db.execute(sql\`${escapeSqlForTemplate(stmt)}\`);`)
    .join('\n');

  return `export async function ${functionName}({ db, sql }: MigrationContext): Promise<void> {
${body || '  // No changes'}
}`;
}
