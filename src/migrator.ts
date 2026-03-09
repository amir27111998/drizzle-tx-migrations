import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { MigrationTable } from './migration-table';
import type {
  Migration,
  MigrationContext,
  MigratorOptions,
  MigrationMeta,
  RunMigrationsOptions,
  RevertMigrationsOptions,
  TransactionMode,
} from './types';

export class Migrator {
  private migrationTable: MigrationTable;
  public readonly options: MigratorOptions;

  constructor(options: MigratorOptions) {
    this.options = options;
    this.migrationTable = new MigrationTable(
      this.options.db,
      this.options.dialect,
      this.options.config.migrationsTable
    );
  }

  async initialize(): Promise<void> {
    await this.migrationTable.ensureTable();
  }

  async runMigrations(
    options: RunMigrationsOptions = {}
  ): Promise<{ success: boolean; executed: string[] }> {
    const { fake = false, transactionMode = 'each', dryRun = false } = options;
    await this.initialize();

    const pendingMigrations = await this.getPendingMigrations();
    const executed: string[] = [];

    if (pendingMigrations.length === 0) {
      console.log('No pending migrations to run.');
      return { success: true, executed };
    }

    if (dryRun) {
      console.log(`[DRY RUN] Would execute ${pendingMigrations.length} migration(s):\n`);
      for (const migration of pendingMigrations) {
        console.log(`  - ${migration.name}`);
      }
      return { success: true, executed: [] };
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s).\n`);

    if (fake) {
      console.log('[FAKE] Marking migrations as executed without running them.\n');
    }

    // Handle 'all' transaction mode - wrap everything in one transaction
    if (transactionMode === 'all' && !fake) {
      try {
        await this.beginTransaction();

        for (const migration of pendingMigrations) {
          try {
            await this.executeMigration(migration, 'up', false);
            await this.migrationTable.addMigration(migration.name, migration.timestamp);
            executed.push(migration.name);
            console.log(`✓ Migration "${migration.name}" executed successfully.`);
          } catch (error) {
            console.error(`✗ Migration "${migration.name}" failed:`, error);
            await this.rollbackTransaction();
            return { success: false, executed };
          }
        }

        await this.commitTransaction();
        console.log(`\n✓ All migrations executed successfully.`);
        return { success: true, executed };
      } catch (error) {
        console.error('Transaction error:', error);
        await this.rollbackTransaction();
        return { success: false, executed };
      }
    }

    // Handle 'each' or 'none' modes
    for (const migration of pendingMigrations) {
      try {
        if (fake) {
          // Fake mode: just record the migration without running it
          await this.migrationTable.addMigration(migration.name, migration.timestamp);
        } else {
          // Determine if this specific migration should use a transaction
          const useTransaction = this.shouldUseTransaction(migration, transactionMode);
          await this.runMigrationWithMode(migration, 'up', useTransaction);
        }
        executed.push(migration.name);
        console.log(
          `✓ Migration "${migration.name}" ${fake ? 'marked as executed (fake)' : 'executed successfully'}.`
        );
      } catch (error) {
        console.error(`✗ Migration "${migration.name}" failed:`, error);
        return { success: false, executed };
      }
    }

    console.log(`\n✓ All migrations ${fake ? 'marked as executed' : 'executed successfully'}.`);
    return { success: true, executed };
  }

  async revertMigration(
    count: number = 1,
    options: RevertMigrationsOptions = {}
  ): Promise<{ success: boolean; reverted: string[] }> {
    const { fake = false, transactionMode = 'each', dryRun = false } = options;
    await this.initialize();

    const executedMigrations = await this.migrationTable.getExecutedMigrations();
    const toRevert = executedMigrations.slice(-count).reverse();
    const reverted: string[] = [];

    if (toRevert.length === 0) {
      console.log('No migrations to revert.');
      return { success: true, reverted };
    }

    if (dryRun) {
      console.log(`[DRY RUN] Would revert ${toRevert.length} migration(s):\n`);
      for (const meta of toRevert) {
        console.log(`  - ${meta.name}`);
      }
      return { success: true, reverted: [] };
    }

    console.log(`Reverting ${toRevert.length} migration(s).\n`);

    if (fake) {
      console.log('[FAKE] Removing migrations from tracking without running down().\n');
    }

    // Handle 'all' transaction mode
    if (transactionMode === 'all' && !fake) {
      try {
        await this.beginTransaction();

        for (const meta of toRevert) {
          try {
            const migration = await this.loadMigration(meta.name);
            await this.executeMigration(migration, 'down', false);
            await this.migrationTable.removeMigration(migration.name);
            reverted.push(migration.name);
            console.log(`✓ Migration "${migration.name}" reverted successfully.`);
          } catch (error) {
            console.error(`✗ Failed to revert migration "${meta.name}":`, error);
            await this.rollbackTransaction();
            return { success: false, reverted };
          }
        }

        await this.commitTransaction();
        console.log(`\n✓ All migrations reverted successfully.`);
        return { success: true, reverted };
      } catch (error) {
        console.error('Transaction error:', error);
        await this.rollbackTransaction();
        return { success: false, reverted };
      }
    }

    // Handle 'each' or 'none' modes
    for (const meta of toRevert) {
      try {
        const migration = await this.loadMigration(meta.name);
        if (fake) {
          // Fake mode: just remove from tracking without running down()
          await this.migrationTable.removeMigration(migration.name);
        } else {
          const useTransaction = this.shouldUseTransaction(migration, transactionMode);
          await this.runMigrationWithMode(migration, 'down', useTransaction);
        }
        reverted.push(migration.name);
        console.log(
          `✓ Migration "${migration.name}" ${fake ? 'removed from tracking (fake)' : 'reverted successfully'}.`
        );
      } catch (error) {
        console.error(`✗ Failed to revert migration "${meta.name}":`, error);
        return { success: false, reverted };
      }
    }

    console.log(`\n✓ All migrations ${fake ? 'removed from tracking' : 'reverted successfully'}.`);
    return { success: true, reverted };
  }

  async revertTo(
    targetName: string,
    options: RevertMigrationsOptions = {}
  ): Promise<{ success: boolean; reverted: string[] }> {
    const { fake = false, transactionMode = 'each', dryRun = false } = options;
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

    if (dryRun) {
      console.log(
        `[DRY RUN] Would revert to migration "${targetName}" (${toRevert.length} migration(s)):\n`
      );
      for (const meta of toRevert) {
        console.log(`  - ${meta.name}`);
      }
      return { success: true, reverted: [] };
    }

    console.log(`Reverting to migration "${targetName}" (${toRevert.length} migration(s)).\n`);

    if (fake) {
      console.log('[FAKE] Removing migrations from tracking without running down().\n');
    }

    // Handle 'all' transaction mode
    if (transactionMode === 'all' && !fake) {
      try {
        await this.beginTransaction();

        for (const meta of toRevert) {
          try {
            const migration = await this.loadMigration(meta.name);
            await this.executeMigration(migration, 'down', false);
            await this.migrationTable.removeMigration(migration.name);
            reverted.push(migration.name);
            console.log(`✓ Migration "${migration.name}" reverted successfully.`);
          } catch (error) {
            console.error(`✗ Failed to revert migration "${meta.name}":`, error);
            await this.rollbackTransaction();
            return { success: false, reverted };
          }
        }

        await this.commitTransaction();
        console.log(`\n✓ Successfully reverted to "${targetName}".`);
        return { success: true, reverted };
      } catch (error) {
        console.error('Transaction error:', error);
        await this.rollbackTransaction();
        return { success: false, reverted };
      }
    }

    for (const meta of toRevert) {
      try {
        const migration = await this.loadMigration(meta.name);
        if (fake) {
          await this.migrationTable.removeMigration(migration.name);
        } else {
          const useTransaction = this.shouldUseTransaction(migration, transactionMode);
          await this.runMigrationWithMode(migration, 'down', useTransaction);
        }
        reverted.push(migration.name);
        console.log(
          `✓ Migration "${migration.name}" ${fake ? 'removed from tracking (fake)' : 'reverted successfully'}.`
        );
      } catch (error) {
        console.error(`✗ Failed to revert migration "${meta.name}":`, error);
        return { success: false, reverted };
      }
    }

    console.log(
      `\n✓ Successfully ${fake ? 'removed migrations to' : 'reverted to'} "${targetName}".`
    );
    return { success: true, reverted };
  }

  /**
   * Determine if a migration should use a transaction based on mode and per-migration settings.
   */
  private shouldUseTransaction(migration: Migration, mode: TransactionMode): boolean {
    // 'all' mode is handled at a higher level
    if (mode === 'all') return false;

    // Per-migration override takes precedence
    if (migration.transaction !== undefined) {
      return migration.transaction;
    }

    // Default based on mode
    return mode === 'each';
  }

  /**
   * Execute a migration with or without transaction wrapping based on mode.
   */
  private async runMigrationWithMode(
    migration: Migration,
    direction: 'up' | 'down',
    useTransaction: boolean
  ): Promise<void> {
    if (useTransaction) {
      await this.runMigrationInTransaction(migration, direction);
    } else {
      await this.executeMigration(migration, direction, true);
    }
  }

  /**
   * Execute migration without managing transaction (for use within 'all' mode or 'none' mode).
   */
  private async executeMigration(
    migration: Migration,
    direction: 'up' | 'down',
    updateTracking: boolean
  ): Promise<void> {
    const context: MigrationContext = {
      db: this.options.db,
      sql: (strings: TemplateStringsArray, ...values: any[]) => sql(strings, ...values),
    };

    if (direction === 'up') {
      await migration.up(context);
      if (updateTracking) {
        await this.migrationTable.addMigration(migration.name, migration.timestamp);
      }
    } else {
      await migration.down(context);
      if (updateTracking) {
        await this.migrationTable.removeMigration(migration.name);
      }
    }
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

    // Check for per-migration transaction override
    const transactionOverride =
      migrationModule.transaction !== undefined
        ? migrationModule.transaction
        : migration.transaction;

    return {
      name,
      timestamp,
      up: migration.up,
      down: migration.down,
      transaction: transactionOverride,
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
