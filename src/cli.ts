#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { sql } from 'drizzle-orm';
import type { TransactionMode } from './types';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printUsage();
    process.exit(0);
  }

  // Check for config file (.js or .ts)
  const configPathJs = path.join(process.cwd(), 'drizzle-migrations.config.js');
  const configPathTs = path.join(process.cwd(), 'drizzle-migrations.config.ts');

  let configPath: string;
  let isTsConfig = false;

  if (fs.existsSync(configPathJs)) {
    configPath = configPathJs;
  } else if (fs.existsSync(configPathTs)) {
    configPath = configPathTs;
    isTsConfig = true;
  } else {
    console.error('Error: drizzle-migrations.config.js or .ts not found in current directory.');
    console.error('Please create a configuration file first.');
    process.exit(1);
  }

  try {
    // For TypeScript config files, use jiti to load them
    let config: any;
    if (isTsConfig) {
      // Use jiti to load TypeScript config files
      const { createJiti } = await import('jiti');
      const jiti = createJiti(__filename);
      config = jiti(configPath);
    } else {
      config = await import(configPath);
    }

    const { migrator, generator } = config.default || config;

    switch (command) {
      case 'generate': {
        const name = args[1] || args.find((arg) => arg.startsWith('--name='))?.split('=')[1];
        if (!name) {
          console.error('Error: Migration name is required.');
          console.error('Usage: drizzle-tx-migrations generate <name>');
          console.error('   or: drizzle-tx-migrations generate --name=<name>');
          process.exit(1);
        }

        // Check for -o flag (output JS instead of TS)
        const outputJS = args.includes('-o') || args.includes('--output-js');
        const outputFormat = outputJS ? 'js' : 'ts';

        const filePath = await generator.generateMigration(name, { outputFormat });
        console.log(`✓ Migration created: ${path.relative(process.cwd(), filePath)}`);
        break;
      }

      case 'up':
      case 'run': {
        const dryRun = args.includes('--dry-run');
        const fake = args.includes('--fake') || args.includes('-f');
        const transactionMode = parseTransactionMode(args);

        if (dryRun) {
          console.log('[DRY RUN] Preview mode - no changes will be made.\n');
        }

        console.log('Running migrations...\n');
        const result = await migrator.runMigrations({
          fake,
          transactionMode,
          dryRun,
        });

        if (!result.success) {
          console.error('\n✗ Migration failed. Transaction rolled back.');
          process.exit(1);
        }

        if (result.executed.length === 0 && !dryRun) {
          console.log('Database is up to date.');
        }
        break;
      }

      case 'down':
      case 'revert': {
        const countArg = args.find((arg) => arg.startsWith('--count='));
        const count = countArg ? parseInt(countArg.split('=')[1]) : 1;
        const dryRun = args.includes('--dry-run');
        const fake = args.includes('--fake') || args.includes('-f');
        const transactionMode = parseTransactionMode(args);

        const toArg = args.find((arg) => arg.startsWith('--to='));

        if (dryRun) {
          console.log('[DRY RUN] Preview mode - no changes will be made.\n');
        }

        if (toArg) {
          const targetName = toArg.split('=')[1];
          const result = await migrator.revertTo(targetName, {
            fake,
            transactionMode,
            dryRun,
          });

          if (!result.success) {
            console.error('\n✗ Revert failed. Transaction rolled back.');
            process.exit(1);
          }
        } else {
          const result = await migrator.revertMigration(count, {
            fake,
            transactionMode,
            dryRun,
          });

          if (!result.success) {
            console.error('\n✗ Revert failed. Transaction rolled back.');
            process.exit(1);
          }
        }
        break;
      }

      case 'status': {
        const status = await migrator.getStatus();

        console.log('Migration Status:\n');

        if (status.executed.length > 0) {
          console.log('✓ Executed migrations:');
          status.executed.forEach((m: any) => {
            const date = m.executed_at ? new Date(m.executed_at).toLocaleString() : 'N/A';
            console.log(`  - ${m.name} (${date})`);
          });
        } else {
          console.log('✓ Executed migrations: None');
        }

        console.log('');

        if (status.pending.length > 0) {
          console.log('⏳ Pending migrations:');
          status.pending.forEach((name: string) => {
            console.log(`  - ${name}`);
          });
        } else {
          console.log('⏳ Pending migrations: None');
        }

        console.log('');
        console.log(`Database is ${status.pending.length === 0 ? 'up to date' : 'behind'}.`);
        break;
      }

      case 'check': {
        const { MigrationValidator } = await import('./validator');
        const migrationsFolder =
          config.default?.migrator?.options?.config?.migrationsFolder ||
          config.migrator?.options?.config?.migrationsFolder ||
          './migrations';

        const validator = new MigrationValidator(migrationsFolder);

        const failOnPending = !args.includes('--no-fail-pending');

        console.log('🔍 Checking migrations...\n');

        const result = await validator.check(() => migrator.getStatus(), { failOnPending });

        // Print executed/pending summary
        console.log(`✓ Executed migrations: ${result.executed}`);
        console.log(`⏳ Pending migrations: ${result.pending}\n`);

        // Print warnings
        if (result.warnings.length > 0) {
          console.log('⚠️  Warnings:');
          result.warnings.forEach((w) => console.log(`  - ${w}`));
          console.log('');
        }

        // Print errors
        if (result.errors.length > 0) {
          console.log('✗ Errors:');
          result.errors.forEach((e) => console.log(`  - ${e}`));
          console.log('');
        }

        // Final verdict
        if (result.valid) {
          if (result.pending === 0) {
            console.log('✅ All checks passed! Database is up to date.');
          } else {
            console.log(
              `✅ All checks passed! (${result.pending} pending migration${result.pending > 1 ? 's' : ''} ready to run)`
            );
          }
          process.exit(0);
        } else {
          if (result.hasPendingMigrations && !result.hasValidationErrors) {
            console.log('❌ Check failed: Database has pending migrations that need to be run.');
            console.log('   Run: drizzle-tx-migrations up');
          } else if (result.hasValidationErrors) {
            console.log('❌ Check failed: Migration validation errors found.');
          } else {
            console.log('❌ Check failed.');
          }
          process.exit(1);
        }
        break;
      }

      case 'validate': {
        const { MigrationValidator } = await import('./validator');
        const migrationsFolder =
          config.default?.migrator?.options?.config?.migrationsFolder ||
          config.migrator?.options?.config?.migrationsFolder ||
          './migrations';

        const validator = new MigrationValidator(migrationsFolder);

        console.log('Validating migration files...\n');

        const result = await validator.validate();

        if (result.warnings.length > 0) {
          console.log('⚠️  Warnings:');
          result.warnings.forEach((w) => console.log(`  - ${w}`));
          console.log('');
        }

        if (result.errors.length > 0) {
          console.log('✗ Errors:');
          result.errors.forEach((e) => console.log(`  - ${e}`));
          console.log('');
          console.log('✗ Validation failed!');
          process.exit(1);
        }

        if (result.errors.length === 0 && result.warnings.length === 0) {
          console.log('✓ All migration files are valid!');
        } else if (result.errors.length === 0) {
          console.log('✓ Validation passed with warnings.');
        }

        break;
      }

      case 'list': {
        const migrations = generator.listMigrations();

        if (migrations.length === 0) {
          console.log('No migrations found.');
        } else {
          console.log('Available migrations:');
          migrations.forEach((name: string) => {
            console.log(`  - ${name}`);
          });
        }
        break;
      }

      case 'query': {
        const queryString = args.slice(1).join(' ');
        if (!queryString) {
          console.error('Error: SQL query is required.');
          console.error('Usage: drizzle-tx-migrations query "SELECT * FROM users"');
          process.exit(1);
        }

        console.log('Executing query...\n');
        try {
          const db = migrator.options?.db || config.default?.migrator?.options?.db;
          if (!db) {
            console.error('Error: Database connection not available.');
            process.exit(1);
          }

          const result = await db.execute(sql.raw(queryString));

          // Handle different driver result formats
          let rows: any[];
          if (Array.isArray(result)) {
            rows = result[0] || result;
          } else if (result.rows) {
            rows = result.rows;
          } else {
            rows = result;
          }

          if (Array.isArray(rows) && rows.length > 0) {
            console.table(rows);
            console.log(`\n${rows.length} row(s) returned.`);
          } else {
            console.log('Query executed successfully. No rows returned.');
          }
        } catch (error: any) {
          console.error('Query failed:', error.message || error);
          process.exit(1);
        }
        break;
      }

      case 'import': {
        // Import drizzle-kit migrations
        const drizzleFolder =
          args[1] || args.find((arg) => arg.startsWith('--from='))?.split('=')[1] || './drizzle';
        const outputJS = args.includes('-o') || args.includes('--output-js');
        const markExecuted = args.includes('--mark-executed') || args.includes('-e');

        console.log(`Importing migrations from drizzle-kit folder: ${drizzleFolder}\n`);

        const result = await generator.importFromDrizzleKit(drizzleFolder, {
          outputFormat: outputJS ? 'js' : 'ts',
          markAsExecuted: markExecuted,
        });

        console.log('');

        if (result.imported.length > 0) {
          console.log(`✓ Successfully imported ${result.imported.length} migration(s).`);
        }

        if (result.skipped.length > 0) {
          console.log(`⏭ Skipped ${result.skipped.length} migration(s):`);
          result.skipped.forEach((s: { name: string; reason: string }) => {
            console.log(`  - ${s.name}: ${s.reason}`);
          });
        }

        if (result.errors.length > 0) {
          console.log(`\n⚠ Errors (${result.errors.length}):`);
          result.errors.forEach((e: string) => {
            console.log(`  - ${e}`);
          });
        }

        if (result.imported.length > 0 && markExecuted) {
          console.log('\nMarking imported migrations as executed...');
          for (const imp of result.imported) {
            try {
              // Load the migration and mark as executed using fake
              await migrator.runMigrations({ fake: true });
            } catch (err: any) {
              console.error(`Failed to mark ${imp.newName} as executed: ${err.message}`);
            }
          }
          console.log('✓ Done.');
        }

        if (result.imported.length > 0) {
          console.log('\n📝 Note: Please review the down() functions in imported migrations.');
          console.log(
            '   Drizzle-kit does not generate down migrations, so they may need manual implementation.'
          );
        }
        break;
      }

      case 'schema:sync': {
        const dryRun = args.includes('--dry-run');
        await handleSchemaSync(config, dryRun);
        break;
      }

      case 'schema:log': {
        await handleSchemaLog(config);
        break;
      }

      case 'schema:drop': {
        const force = args.includes('--force');
        const dryRun = args.includes('--dry-run');
        await handleSchemaDrop(config, force, dryRun);
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

function parseTransactionMode(args: string[]): TransactionMode {
  const txArg = args.find((arg) => arg.startsWith('--transaction='));
  if (!txArg) return 'each';

  const mode = txArg.split('=')[1];
  if (mode === 'all' || mode === 'each' || mode === 'none') {
    return mode;
  }
  console.warn(`Warning: Invalid transaction mode "${mode}". Using default "each".`);
  return 'each';
}

async function handleSchemaSync(config: any, dryRun: boolean): Promise<void> {
  const { SchemaIntrospector } = await import('./schema-introspector');
  const { SchemaLoader } = await import('./schema-loader');
  const { SchemaDiffer } = await import('./schema-differ');
  const { SqlGenerator } = await import('./sql-generator');

  const migrator = config.default?.migrator || config.migrator;
  const db = migrator?.options?.db;
  const dialect = migrator?.options?.dialect;
  const schemaFiles = migrator?.options?.config?.schemaFiles;

  if (!db || !dialect) {
    console.error('Error: Database connection and dialect required for schema:sync.');
    process.exit(1);
  }

  if (!schemaFiles || schemaFiles.length === 0) {
    console.error('Error: schemaFiles configuration required for schema:sync.');
    console.error('Add schemaFiles to your config: schemaFiles: ["./src/schema/**/*.ts"]');
    process.exit(1);
  }

  console.log('Synchronizing schema...\n');

  // Introspect current state
  const introspector = new SchemaIntrospector(db, dialect);
  const currentSchema = await introspector.introspect();
  console.log(`Found ${currentSchema.tables.size} tables in database`);

  // Load desired schema
  const loader = new SchemaLoader(schemaFiles, dialect);
  const desiredSchema = await loader.loadSchema();
  console.log(`Found ${desiredSchema.tables.size} tables in schema files`);

  // Diff
  const differ = new SchemaDiffer(currentSchema, desiredSchema);
  const changes = differ.diff();

  if (changes.length === 0) {
    console.log('\n✓ Schema is already synchronized.');
    return;
  }

  console.log(`\nDetected ${changes.length} schema changes:\n`);

  // Generate SQL
  const sqlGenerator = new SqlGenerator(dialect);
  const { upStatements } = sqlGenerator.generate(changes);

  for (const stmt of upStatements) {
    console.log(`  ${stmt}`);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] No changes made.');
    return;
  }

  console.log('\nExecuting changes...');

  for (const stmt of upStatements) {
    try {
      await db.execute(sql.raw(stmt));
      console.log(`✓ ${stmt.substring(0, 60)}${stmt.length > 60 ? '...' : ''}`);
    } catch (error: any) {
      console.error(`✗ Failed: ${stmt}`);
      console.error(`  Error: ${error.message || error}`);
      process.exit(1);
    }
  }

  console.log('\n✓ Schema synchronized successfully.');
}

async function handleSchemaLog(config: any): Promise<void> {
  const { SchemaIntrospector } = await import('./schema-introspector');
  const { SchemaLoader } = await import('./schema-loader');
  const { SchemaDiffer } = await import('./schema-differ');
  const { SqlGenerator } = await import('./sql-generator');

  const migrator = config.default?.migrator || config.migrator;
  const db = migrator?.options?.db;
  const dialect = migrator?.options?.dialect;
  const schemaFiles = migrator?.options?.config?.schemaFiles;

  if (!db || !dialect) {
    console.error('Error: Database connection and dialect required for schema:log.');
    process.exit(1);
  }

  if (!schemaFiles || schemaFiles.length === 0) {
    console.error('Error: schemaFiles configuration required for schema:log.');
    process.exit(1);
  }

  console.log('Analyzing schema differences...\n');

  // Introspect current state
  const introspector = new SchemaIntrospector(db, dialect);
  const currentSchema = await introspector.introspect();

  // Load desired schema
  const loader = new SchemaLoader(schemaFiles, dialect);
  const desiredSchema = await loader.loadSchema();

  // Diff
  const differ = new SchemaDiffer(currentSchema, desiredSchema);
  const changes = differ.diff();

  if (changes.length === 0) {
    console.log('No schema changes detected. Database is synchronized.');
    return;
  }

  console.log(`Found ${changes.length} change(s) that would be executed:\n`);

  // Generate SQL
  const sqlGenerator = new SqlGenerator(dialect);
  const { upStatements } = sqlGenerator.generate(changes);

  for (const stmt of upStatements) {
    console.log(stmt);
    console.log('');
  }
}

async function handleSchemaDrop(config: any, force: boolean, dryRun: boolean): Promise<void> {
  const { SchemaIntrospector } = await import('./schema-introspector');

  const migrator = config.default?.migrator || config.migrator;
  const db = migrator?.options?.db;
  const dialect = migrator?.options?.dialect;

  if (!db || !dialect) {
    console.error('Error: Database connection and dialect required for schema:drop.');
    process.exit(1);
  }

  if (!force && !dryRun) {
    console.error(
      'Error: schema:drop is destructive. Use --force to confirm or --dry-run to preview.'
    );
    process.exit(1);
  }

  console.log('Analyzing database schema...\n');

  // Introspect current state
  const introspector = new SchemaIntrospector(db, dialect);
  const currentSchema = await introspector.introspect();

  const tables = Array.from(currentSchema.tables.keys());

  if (tables.length === 0) {
    console.log('No tables found in database.');
    return;
  }

  console.log(`Found ${tables.length} table(s) to drop:\n`);
  for (const table of tables) {
    console.log(`  - ${table}`);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] No tables dropped.');
    return;
  }

  console.log('\nDropping tables...');

  // Drop in reverse order to handle foreign keys
  const reversedTables = [...tables].reverse();

  for (const table of reversedTables) {
    const quotedTable = dialect === 'mysql' ? `\`${table}\`` : `"${table}"`;
    const dropStmt = `DROP TABLE IF EXISTS ${quotedTable} CASCADE`;

    try {
      await db.execute(sql.raw(dropStmt));
      console.log(`✓ Dropped ${table}`);
    } catch (error: any) {
      console.error(`✗ Failed to drop ${table}: ${error.message || error}`);
      process.exit(1);
    }
  }

  console.log('\n✓ All tables dropped successfully.');
}

function printUsage() {
  console.log(`
Drizzle TX Migrations - TypeORM-like migrations with transaction support

Usage:
  drizzle-tx-migrations <command> [options]

Migration Commands:
  generate <name>           Generate a new migration file
  up, run                   Run all pending migrations
  down, revert              Revert the last migration
  down --count=<n>          Revert the last N migrations
  down --to=<name>          Revert to a specific migration
  status                    Show migration status (executed vs pending)
  check                     Validate migrations and check if DB is up to date (exits 1 if pending)
  validate                  Validate migration files only (no DB check)
  list                      List all migration files

Import Commands:
  import [folder]           Import migrations from drizzle-kit format
                            Converts SQL migrations to TypeScript/JavaScript with up/down functions

Schema Commands:
  schema:sync               Synchronize database schema with Drizzle schema (bypasses migrations)
  schema:log                Show SQL that would be executed by schema:sync
  schema:drop               Drop all tables from the database (requires --force)

Query Commands:
  query "<sql>"             Execute a raw SQL query and display results

Options:
  --name=<name>             Migration name (for generate command)
  -o, --output-js           Generate JavaScript migration instead of TypeScript
  --count=<n>               Number of migrations to revert
  --to=<name>               Target migration name to revert to
  --no-fail-pending         Don't fail check command if there are pending migrations
  --dry-run                 Preview what would be done without executing
  --fake, -f                Mark migrations as run without executing (up/down)
  --transaction=<mode>      Transaction mode: all, each (default), or none
  --force                   Required for destructive operations like schema:drop
  --from=<folder>           Source folder for import command (default: ./drizzle)
  --mark-executed, -e       Mark imported migrations as already executed

Transaction Modes:
  all     Wrap ALL migrations in a single transaction (all-or-nothing)
  each    Wrap EACH migration in its own transaction (default, TypeORM-like)
  none    Run migrations WITHOUT transaction wrapping

Per-Migration Transaction Control:
  Export 'transaction' from your migration file to override the mode:
    export const transaction = false;  // Disable transaction for this migration

Examples:
  drizzle-tx-migrations generate create_users_table
  drizzle-tx-migrations generate --name=add_email_column
  drizzle-tx-migrations generate add_posts -o               # Generate JS file
  drizzle-tx-migrations up
  drizzle-tx-migrations up --dry-run                        # Preview migrations
  drizzle-tx-migrations up --fake                           # Mark as run without executing
  drizzle-tx-migrations up --transaction=all                # Single transaction for all
  drizzle-tx-migrations down
  drizzle-tx-migrations down --count=3
  drizzle-tx-migrations down --to=1234567890_create_users_table
  drizzle-tx-migrations down --fake                         # Remove from tracking only
  drizzle-tx-migrations status
  drizzle-tx-migrations check                               # For CI/CD: fails if pending
  drizzle-tx-migrations check --no-fail-pending             # Only validate
  drizzle-tx-migrations validate                            # Validate files without DB
  drizzle-tx-migrations query "SELECT * FROM users LIMIT 10"
  drizzle-tx-migrations import ./drizzle                    # Import drizzle-kit migrations
  drizzle-tx-migrations import --from=./drizzle -o          # Import as JavaScript
  drizzle-tx-migrations import ./drizzle --mark-executed    # Import and mark as run
  drizzle-tx-migrations schema:log                          # Preview schema sync SQL
  drizzle-tx-migrations schema:sync --dry-run               # Preview schema sync
  drizzle-tx-migrations schema:sync                         # Apply schema changes directly
  drizzle-tx-migrations schema:drop --force                 # Drop all tables
  `);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
