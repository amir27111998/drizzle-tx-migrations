// Main exports
export { Migrator } from './migrator';
export { MigrationGenerator } from './generator';
export { MigrationTable } from './migration-table';
export { MigrationValidator } from './validator';
export { SchemaIntrospector } from './schema-introspector';
export { SchemaLoader } from './schema-loader';
export { SchemaDiffer } from './schema-differ';
export { SqlGenerator } from './sql-generator';

// Type exports
export type {
  Migration,
  MigrationContext,
  MigrationConfig,
  MigrationMeta,
  MigratorOptions,
  DbDialect,
  TransactionMode,
  RunMigrationsOptions,
  RevertMigrationsOptions,
  GeneratorOptions,
  ImportOptions,
  ImportResult,
} from './types';
export type { ValidationResult, CheckResult } from './validator';

// Schema types (from centralized location)
export type {
  DatabaseSchema,
  TableSchema,
  TableColumn,
  TableIndex,
  ForeignKey,
  SchemaChange,
  TableChange,
} from './types/schema-types';

// Constants
export { MIGRATION_TABLE_NAME, SUPPORTED_DIALECTS, FILE_EXTENSIONS } from './constants';

// Error classes
export {
  MigrationError,
  SchemaLoadError,
  IntrospectionError,
  GeneratorError,
  ExecutionError,
} from './errors';

// Utilities (for advanced usage)
export { quote, getQuoteChar, isValidDialect } from './utils/dialect-utils';
export {
  normalizeType,
  normalizeDrizzleType,
  normalizePostgreSQLType,
  normalizeMySQLType,
  normalizeSQLiteType,
} from './utils/type-normalizer';
export {
  normalizeRows,
  normalizeSingleValue,
  normalizeCount,
  hasRows,
} from './utils/result-normalizer';
export { escapeSqlForTemplate, formatDefaultValue, isSqlFunction } from './utils/sql-string';
export {
  toAbsolutePath,
  ensureDirectoryExists,
  isSchemaFile,
  sanitizeFileName,
  generateMigrationFileName,
} from './utils/path-resolver';
