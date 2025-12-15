import { type SQL } from 'drizzle-orm';

export type DbDialect = 'postgresql' | 'mysql' | 'sqlite';

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
