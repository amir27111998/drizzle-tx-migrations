import * as fs from 'fs';
import * as path from 'path';
import type { DbDialect } from './types';
import { SchemaIntrospector } from './schema-introspector';
import { SchemaLoader } from './schema-loader';
import { SchemaDiffer } from './schema-differ';
import { SqlGenerator } from './sql-generator';

export class MigrationGenerator {
  constructor(
    private migrationsFolder: string,
    private db?: any,
    private dialect?: DbDialect,
    private schemaFiles?: string[]
  ) {}

  async generateMigration(name: string): Promise<string> {
    const timestamp = Date.now();
    const fileName = `${timestamp}_${this.sanitizeName(name)}`;
    const fullPath = path.join(this.migrationsFolder, `${fileName}.ts`);

    this.ensureMigrationsFolder();

    // Try to auto-generate migration from schema diff
    const content = await this.generateMigrationContent(name);
    fs.writeFileSync(fullPath, content);

    return fullPath;
  }

  private async generateMigrationContent(name: string): Promise<string> {
    // Check if we can auto-generate
    if (!this.db || !this.dialect || !this.schemaFiles || this.schemaFiles.length === 0) {
      console.log('No schema configuration provided, generating blank migration template');
      return this.getMigrationTemplate(name);
    }

    try {
      console.log('Auto-generating migration from schema diff...');

      // Introspect current database state
      const introspector = new SchemaIntrospector(this.db, this.dialect);
      const currentSchema = await introspector.introspect();
      console.log(`Found ${currentSchema.tables.size} tables in database`);

      // Load desired schema from files
      const loader = new SchemaLoader(this.schemaFiles, this.dialect);
      const desiredSchema = await loader.loadSchema();
      console.log(`Found ${desiredSchema.tables.size} tables in schema files`);

      // Diff the schemas
      const differ = new SchemaDiffer(currentSchema, desiredSchema);
      const changes = differ.diff();

      if (changes.length === 0) {
        console.log('No schema changes detected, generating blank migration template');
        return this.getMigrationTemplate(name);
      }

      console.log(`Detected ${changes.length} schema changes`);

      // Generate SQL
      const sqlGenerator = new SqlGenerator(this.dialect);
      const { upStatements, downStatements } = sqlGenerator.generate(changes);

      // Create migration content with generated SQL
      return this.getMigrationTemplateWithSQL(name, upStatements, downStatements, changes);
    } catch (error) {
      console.warn('Failed to auto-generate migration:', error);
      console.log('Falling back to blank migration template');
      return this.getMigrationTemplate(name);
    }
  }

  private getMigrationTemplateWithSQL(
    name: string,
    upStatements: string[],
    downStatements: string[],
    changes: any[]
  ): string {
    const changesSummary = this.generateChangesSummary(changes);

    const upSQL = upStatements.map((stmt) => `  await db.execute(sql\`${stmt}\`);`).join('\n');
    const downSQL = downStatements.map((stmt) => `  await db.execute(sql\`${stmt}\`);`).join('\n');

    return `import { type MigrationContext } from 'drizzle-tx-migrations';

/**
 * Migration: ${name}
 *
 * This migration was auto-generated from schema changes.
 * Please review the changes carefully before running the migration.
 *
 * Changes detected:
${changesSummary}
 *
 * This migration runs in a transaction. If any operation fails,
 * all changes will be automatically rolled back.
 */

export async function up({ db, sql }: MigrationContext): Promise<void> {
${upSQL || '  // No changes'}
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
${downSQL || '  // No changes'}
}

export default { up, down };
`;
  }

  private generateChangesSummary(changes: any[]): string {
    const summary: string[] = [];

    for (const change of changes) {
      switch (change.type) {
        case 'create_table':
          summary.push(` * - Create table: ${change.table}`);
          break;
        case 'drop_table':
          summary.push(` * - Drop table: ${change.table}`);
          break;
        case 'alter_table':
          const tableChanges = change.details.changes;
          for (const tc of tableChanges) {
            if (tc.type === 'add_column') {
              summary.push(` * - Add column: ${change.table}.${tc.column}`);
            } else if (tc.type === 'drop_column') {
              summary.push(` * - Drop column: ${change.table}.${tc.column}`);
            } else if (tc.type === 'modify_column') {
              summary.push(` * - Modify column: ${change.table}.${tc.column}`);
            }
          }
          break;
        case 'create_index':
          summary.push(` * - Create index: ${change.details.index.name} on ${change.table}`);
          break;
        case 'drop_index':
          summary.push(` * - Drop index: ${change.details.index.name} on ${change.table}`);
          break;
        case 'add_foreign_key':
          summary.push(
            ` * - Add foreign key: ${change.table}.${change.details.foreignKey.column} -> ${change.details.foreignKey.referencedTable}`
          );
          break;
        case 'drop_foreign_key':
          summary.push(
            ` * - Drop foreign key: ${change.table}.${change.details.foreignKey.column}`
          );
          break;
      }
    }

    return summary.join('\n');
  }

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private ensureMigrationsFolder(): void {
    if (!fs.existsSync(this.migrationsFolder)) {
      fs.mkdirSync(this.migrationsFolder, { recursive: true });
    }
  }

  private getMigrationTemplate(name: string): string {
    return `import { type MigrationContext } from 'drizzle-tx-migrations';

/**
 * Migration: ${name}
 *
 * This migration runs in a transaction. If any operation fails,
 * all changes will be automatically rolled back.
 */

export async function up({ db, sql }: MigrationContext): Promise<void> {
  // Write your migration logic here
  // Example:
  // await db.execute(sql\`
  //   CREATE TABLE users (
  //     id SERIAL PRIMARY KEY,
  //     name VARCHAR(255) NOT NULL,
  //     email VARCHAR(255) UNIQUE NOT NULL,
  //     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  //   )
  // \`);
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
  // Write your rollback logic here
  // Example:
  // await db.execute(sql\`DROP TABLE IF EXISTS users\`);
}

export default { up, down };
`;
  }

  listMigrations(): string[] {
    if (!fs.existsSync(this.migrationsFolder)) {
      return [];
    }

    return fs
      .readdirSync(this.migrationsFolder)
      .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
      .sort();
  }
}
