/**
 * Shared constants for drizzle-tx-migrations
 */

import type { DbDialect } from './types';

/** Default migration table name */
export const MIGRATION_TABLE_NAME = '__drizzle_migrations';

/** Supported database dialects */
export const SUPPORTED_DIALECTS: readonly DbDialect[] = ['postgresql', 'mysql', 'sqlite'] as const;

/** Supported migration file extensions */
export const FILE_EXTENSIONS = ['.ts', '.js'] as const;

/** Quote characters for each dialect */
export const QUOTE_CHARS: Record<DbDialect, string> = {
  postgresql: '"',
  mysql: '`',
  sqlite: '"',
} as const;
