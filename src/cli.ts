#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';

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

        const filePath = await generator.generateMigration(name);
        console.log(`✓ Migration created: ${path.relative(process.cwd(), filePath)}`);
        break;
      }

      case 'up':
      case 'run': {
        console.log('Running migrations...\n');
        const result = await migrator.runMigrations();

        if (!result.success) {
          console.error('\n✗ Migration failed. Transaction rolled back.');
          process.exit(1);
        }

        if (result.executed.length === 0) {
          console.log('Database is up to date.');
        }
        break;
      }

      case 'down':
      case 'revert': {
        const countArg = args.find((arg) => arg.startsWith('--count='));
        const count = countArg ? parseInt(countArg.split('=')[1]) : 1;

        const toArg = args.find((arg) => arg.startsWith('--to='));

        if (toArg) {
          const targetName = toArg.split('=')[1];
          const result = await migrator.revertTo(targetName);

          if (!result.success) {
            console.error('\n✗ Revert failed. Transaction rolled back.');
            process.exit(1);
          }
        } else {
          const result = await migrator.revertMigration(count);

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

function printUsage() {
  console.log(`
Drizzle TX Migrations - TypeORM-like migrations with transaction support

Usage:
  drizzle-tx-migrations <command> [options]

Commands:
  generate <name>           Generate a new migration file
  up, run                   Run all pending migrations
  down, revert              Revert the last migration
  down --count=<n>          Revert the last N migrations
  down --to=<name>          Revert to a specific migration
  status                    Show migration status (executed vs pending)
  check                     Validate migrations and check if DB is up to date (exits 1 if pending)
  validate                  Validate migration files only (no DB check)
  list                      List all migration files

Options:
  --name=<name>            Migration name (for generate command)
  --count=<n>              Number of migrations to revert
  --to=<name>              Target migration name to revert to
  --no-fail-pending        Don't fail check command if there are pending migrations

Examples:
  drizzle-tx-migrations generate create_users_table
  drizzle-tx-migrations generate --name=add_email_column
  drizzle-tx-migrations up
  drizzle-tx-migrations down
  drizzle-tx-migrations down --count=3
  drizzle-tx-migrations down --to=1234567890_create_users_table
  drizzle-tx-migrations status
  drizzle-tx-migrations check                    # For CI/CD: fails if pending migrations
  drizzle-tx-migrations check --no-fail-pending  # Only validate, don't fail on pending
  drizzle-tx-migrations validate                 # Validate files without DB connection
  `);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
