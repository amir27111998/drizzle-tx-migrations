import { type SQL } from 'drizzle-orm';

export type DbDialect = 'postgresql' | 'mysql' | 'sqlite';

/**
 * Transaction mode for running migrations.
 * - 'all': Wrap all migrations in a single transaction (all-or-nothing)
 * - 'each': Wrap each migration in its own transaction (default)
 * - 'none': Run migrations without transaction wrapping
 */
export type TransactionMode = 'all' | 'each' | 'none';

export interface MigrationMeta {
  id: number;
  name: string;
  timestamp: number;
  executed_at?: Date;
}

export interface MigrationContext<TDb = any> {
  db: TDb;
  sql: (strings: TemplateStringsArray, ...values: any[]) => SQL;
}

export interface Migration {
  name: string;
  timestamp: number;
  up: (context: MigrationContext) => Promise<void>;
  down: (context: MigrationContext) => Promise<void>;
  /**
   * Per-migration transaction override.
   * Only takes effect when transaction mode is 'each' or 'none'.
   */
  transaction?: boolean;
}

export interface RunMigrationsOptions {
  /**
   * If true, mark migrations as executed without running them.
   * Useful for migrations applied manually or externally.
   */
  fake?: boolean;
  /**
   * Transaction mode for running migrations.
   * @default 'each'
   */
  transactionMode?: TransactionMode;
  /**
   * If true, only show what would be done without executing.
   */
  dryRun?: boolean;
}

export interface RevertMigrationsOptions {
  /**
   * If true, remove migration from tracking without running down().
   */
  fake?: boolean;
  /**
   * Transaction mode for reverting migrations.
   * @default 'each'
   */
  transactionMode?: TransactionMode;
  /**
   * If true, only show what would be done without executing.
   */
  dryRun?: boolean;
}

export interface MigrationConfig {
  migrationsFolder: string;
  migrationsTable?: string;
  schemaFiles?: string[];
  dbCredentials?: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    // For SQLite
    url?: string;
  };
}

export interface SchemaChange {
  type: 'create_table' | 'drop_table' | 'alter_table' | 'create_index' | 'drop_index';
  table?: string;
  column?: string;
  changes?: any;
}

export interface GeneratedMigration {
  upSql: string;
  downSql: string;
  hasChanges: boolean;
}

export interface MigratorOptions<TDb = any> {
  db: TDb;
  dialect: DbDialect;
  config: MigrationConfig;
}

export interface GeneratorOptions {
  /**
   * Output format: 'ts' for TypeScript, 'js' for JavaScript
   * @default 'ts'
   */
  outputFormat?: 'ts' | 'js';
}
