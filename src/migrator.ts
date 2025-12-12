import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { MigrationTable } from './migration-table';
import type { Migration, MigrationContext, MigratorOptions, MigrationMeta } from './types';

export class Migrator {
  private migrationTable: MigrationTable;

  constructor(private options: MigratorOptions) {
    this.migrationTable = new MigrationTable(
      options.db,
      options.dialect,
      options.config.migrationsTable
    );
  }

  async initialize(): Promise<void> {
    await this.migrationTable.ensureTable();
  }

  async runMigrations(): Promise<{ success: boolean; executed: string[] }> {
    await this.initialize();

    const pendingMigrations = await this.getPendingMigrations();
    const executed: string[] = [];

    if (pendingMigrations.length === 0) {
      console.log('No pending migrations to run.');
      return { success: true, executed };
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s).\n`);

    for (const migration of pendingMigrations) {
      try {
        await this.runMigrationInTransaction(migration, 'up');
        executed.push(migration.name);
        console.log(`✓ Migration "${migration.name}" executed successfully.`);
      } catch (error) {
        console.error(`✗ Migration "${migration.name}" failed:`, error);
        return { success: false, executed };
      }
    }

    console.log(`\n✓ All migrations executed successfully.`);
    return { success: true, executed };
  }

  async revertMigration(count: number = 1): Promise<{ success: boolean; reverted: string[] }> {
    await this.initialize();

    const executedMigrations = await this.migrationTable.getExecutedMigrations();
    const toRevert = executedMigrations.slice(-count).reverse();
    const reverted: string[] = [];

    if (toRevert.length === 0) {
      console.log('No migrations to revert.');
      return { success: true, reverted };
    }

    console.log(`Reverting ${toRevert.length} migration(s).\n`);

    for (const meta of toRevert) {
      try {
        const migration = await this.loadMigration(meta.name);
        await this.runMigrationInTransaction(migration, 'down');
        reverted.push(migration.name);
        console.log(`✓ Migration "${migration.name}" reverted successfully.`);
      } catch (error) {
        console.error(`✗ Failed to revert migration "${meta.name}":`, error);
        return { success: false, reverted };
      }
    }

    console.log(`\n✓ All migrations reverted successfully.`);
    return { success: true, reverted };
  }

  async revertTo(targetName: string): Promise<{ success: boolean; reverted: string[] }> {
    await this.initialize();

    const executedMigrations = await this.migrationTable.getExecutedMigrations();
    const targetIndex = executedMigrations.findIndex((m) => m.name === targetName);

    if (targetIndex === -1) {
      throw new Error(`Migration "${targetName}" not found in executed migrations.`);
    }

    const toRevert = executedMigrations.slice(targetIndex + 1).reverse();
    const reverted: string[] = [];

    if (toRevert.length === 0) {
      console.log('No migrations to revert.');
      return { success: true, reverted };
    }

    console.log(`Reverting to migration "${targetName}" (${toRevert.length} migration(s)).\n`);

    for (const meta of toRevert) {
      try {
        const migration = await this.loadMigration(meta.name);
        await this.runMigrationInTransaction(migration, 'down');
        reverted.push(migration.name);
        console.log(`✓ Migration "${migration.name}" reverted successfully.`);
      } catch (error) {
        console.error(`✗ Failed to revert migration "${meta.name}":`, error);
        return { success: false, reverted };
      }
    }

    console.log(`\n✓ Successfully reverted to "${targetName}".`);
    return { success: true, reverted };
  }

  private async runMigrationInTransaction(
    migration: Migration,
    direction: 'up' | 'down'
  ): Promise<void> {
    const context: MigrationContext = {
      db: this.options.db,
      sql: (strings: TemplateStringsArray, ...values: any[]) => sql(strings, ...values),
    };

    // Begin transaction
    await this.beginTransaction();

    try {
      // Run migration
      if (direction === 'up') {
        await migration.up(context);
        await this.migrationTable.addMigration(migration.name, migration.timestamp);
      } else {
        await migration.down(context);
        await this.migrationTable.removeMigration(migration.name);
      }

      // Commit transaction
      await this.commitTransaction();
    } catch (error) {
      // Rollback transaction on error
      await this.rollbackTransaction();
      throw error;
    }
  }

  private async beginTransaction(): Promise<void> {
    try {
      await this.options.db.execute(sql.raw('BEGIN'));
    } catch (error) {
      // Some drivers might use START TRANSACTION
      try {
        await this.options.db.execute(sql.raw('START TRANSACTION'));
      } catch (startError) {
        throw new Error('Failed to begin transaction');
      }
    }
  }

  private async commitTransaction(): Promise<void> {
    await this.options.db.execute(sql.raw('COMMIT'));
  }

  private async rollbackTransaction(): Promise<void> {
    try {
      await this.options.db.execute(sql.raw('ROLLBACK'));
    } catch (error) {
      console.error('Failed to rollback transaction:', error);
    }
  }

  private async getPendingMigrations(): Promise<Migration[]> {
    const allMigrations = await this.loadAllMigrations();
    const executedMigrations = await this.migrationTable.getExecutedMigrations();
    const executedNames = new Set(executedMigrations.map((m) => m.name));

    return allMigrations.filter((m) => !executedNames.has(m.name));
  }

  private async loadAllMigrations(): Promise<Migration[]> {
    const migrationsFolder = path.isAbsolute(this.options.config.migrationsFolder)
      ? this.options.config.migrationsFolder
      : path.resolve(process.cwd(), this.options.config.migrationsFolder);

    if (!fs.existsSync(migrationsFolder)) {
      return [];
    }

    const files = fs
      .readdirSync(migrationsFolder)
      .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
      .sort();

    const migrations: Migration[] = [];

    for (const file of files) {
      const migration = await this.loadMigration(path.basename(file, path.extname(file)));
      migrations.push(migration);
    }

    return migrations;
  }

  private async loadMigration(name: string): Promise<Migration> {
    const migrationsFolder = path.isAbsolute(this.options.config.migrationsFolder)
      ? this.options.config.migrationsFolder
      : path.resolve(process.cwd(), this.options.config.migrationsFolder);
    const tsPath = path.join(migrationsFolder, `${name}.ts`);
    const jsPath = path.join(migrationsFolder, `${name}.js`);

    let migrationPath: string;
    let isTsFile = false;
    if (fs.existsSync(tsPath)) {
      migrationPath = tsPath;
      isTsFile = true;
    } else if (fs.existsSync(jsPath)) {
      migrationPath = jsPath;
    } else {
      throw new Error(`Migration file not found: ${name}`);
    }

    // Load migration with jiti for TypeScript files
    const absolutePath = path.resolve(migrationPath);

    let migrationModule: any;
    if (isTsFile) {
      // Use jiti to load TypeScript files
      const { createJiti } = await import('jiti');
      const jiti = createJiti(__filename);
      migrationModule = jiti(absolutePath);
    } else {
      const fileUrl = pathToFileURL(absolutePath).href;
      migrationModule = await import(fileUrl);
    }

    const migration = migrationModule.default || migrationModule;

    // Extract timestamp from name (format: TIMESTAMP_name)
    const timestamp = parseInt(name.split('_')[0]);

    return {
      name,
      timestamp,
      up: migration.up,
      down: migration.down,
    };
  }

  async getStatus(): Promise<{
    executed: MigrationMeta[];
    pending: string[];
  }> {
    await this.initialize();

    const executed = await this.migrationTable.getExecutedMigrations();
    const allMigrations = await this.loadAllMigrations();
    const executedNames = new Set(executed.map((m) => m.name));
    const pending = allMigrations.filter((m) => !executedNames.has(m.name)).map((m) => m.name);

    return { executed, pending };
  }
}
