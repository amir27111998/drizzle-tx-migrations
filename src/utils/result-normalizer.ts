/**
 * Database result normalization utilities
 *
 * Different database drivers return results in different formats:
 * - MySQL2: [rows[], metadata]
 * - PostgreSQL (pg): { rows: [...] }
 * - SQLite: rows directly as array
 *
 * These utilities normalize results to a consistent format.
 */

/**
 * Normalize database query results to an array of rows
 * Handles different driver formats (MySQL2, PostgreSQL, SQLite)
 */
export function normalizeRows<T = any>(result: any): T[] {
  // MySQL2 returns [rows, metadata]
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0];
  }

  // PostgreSQL returns { rows: [...] }
  if (result && result.rows && Array.isArray(result.rows)) {
    return result.rows;
  }

  // SQLite might return rows directly
  if (Array.isArray(result)) {
    return result;
  }

  // Fallback: return empty array
  return [];
}

/**
 * Extract a single value from query result
 * Useful for queries like SELECT COUNT(*), SELECT MAX(), etc.
 */
export function normalizeSingleValue<T = any>(result: any, key?: string): T | undefined {
  const rows = normalizeRows(result);

  if (rows.length === 0) {
    return undefined;
  }

  const firstRow = rows[0];

  if (key) {
    return firstRow[key];
  }

  // Return the first value of the first row
  const values = Object.values(firstRow);
  return values[0] as T;
}

/**
 * Extract a count value from query result
 * Handles different count column naming conventions
 */
export function normalizeCount(result: any): number {
  const rows = normalizeRows(result);

  if (rows.length === 0) {
    return 0;
  }

  const firstRow = rows[0];

  // Try common count column names
  const count =
    firstRow.count ??
    firstRow.COUNT ??
    firstRow['count(*)'] ??
    firstRow['COUNT(*)'] ??
    Object.values(firstRow)[0];

  return Number(count) || 0;
}

/**
 * Check if a query returned any rows
 */
export function hasRows(result: any): boolean {
  return normalizeRows(result).length > 0;
}
