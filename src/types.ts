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
}

export interface MigratorOptions<TDb = any> {
  db: TDb;
  dialect: DbDialect;
  config: MigrationConfig;
}
