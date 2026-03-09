import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type { DbDialect, GeneratorOptions, ImportOptions, ImportResult } from './types';
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

  async generateMigration(name: string, options: GeneratorOptions = {}): Promise<string> {
    const { outputFormat = 'ts' } = options;
    const timestamp = Date.now();
    const fileName = `${timestamp}_${this.sanitizeName(name)}`;
    const extension = outputFormat === 'js' ? 'js' : 'ts';
    const fullPath = path.join(this.migrationsFolder, `${fileName}.${extension}`);

    this.ensureMigrationsFolder();

    // Try to auto-generate migration from schema diff
    const content = await this.generateMigrationContent(name, outputFormat);
    fs.writeFileSync(fullPath, content);

    return fullPath;
  }

  private async generateMigrationContent(
    name: string,
    outputFormat: 'ts' | 'js' = 'ts'
  ): Promise<string> {
    // Check if we can auto-generate
    if (!this.db || !this.dialect || !this.schemaFiles || this.schemaFiles.length === 0) {
      console.log('No schema configuration provided, generating blank migration template');
      return this.getMigrationTemplate(name, outputFormat);
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
        return this.getMigrationTemplate(name, outputFormat);
      }

      console.log(`Detected ${changes.length} schema changes`);

      // Generate SQL
      const sqlGenerator = new SqlGenerator(this.dialect);
      const { upStatements, downStatements } = sqlGenerator.generate(changes);

      // Create migration content with generated SQL
      return this.getMigrationTemplateWithSQL(
        name,
        upStatements,
        downStatements,
        changes,
        outputFormat
      );
    } catch (error) {
      console.warn('Failed to auto-generate migration:', error);
      console.log('Falling back to blank migration template');
      return this.getMigrationTemplate(name, outputFormat);
    }
  }

  private getMigrationTemplateWithSQL(
    name: string,
    upStatements: string[],
    downStatements: string[],
    changes: any[],
    outputFormat: 'ts' | 'js' = 'ts'
  ): string {
    const changesSummary = this.generateChangesSummary(changes);

    // Escape backticks and dollar signs in SQL to avoid breaking template literals
    const escapeSql = (sqlStr: string) => sqlStr.replace(/`/g, '\\`').replace(/\$/g, '\\$');

    const upSQL = upStatements
      .map((stmt) => `  await db.execute(sql\`${escapeSql(stmt)}\`);`)
      .join('\n');
    const downSQL = downStatements
      .map((stmt) => `  await db.execute(sql\`${escapeSql(stmt)}\`);`)
      .join('\n');

    if (outputFormat === 'js') {
      return `/**
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

async function up({ db, sql }) {
${upSQL || '  // No changes'}
}

async function down({ db, sql }) {
${downSQL || '  // No changes'}
}

module.exports = { up, down };
`;
    }

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
        case 'alter_table': {
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
        }
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

  private getMigrationTemplate(name: string, outputFormat: 'ts' | 'js' = 'ts'): string {
    if (outputFormat === 'js') {
      return `/**
 * Migration: ${name}
 *
 * This migration runs in a transaction. If any operation fails,
 * all changes will be automatically rolled back.
 */

async function up({ db, sql }) {
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

async function down({ db, sql }) {
  // Write your rollback logic here
  // Example:
  // await db.execute(sql\`DROP TABLE IF EXISTS users\`);
}

module.exports = { up, down };
`;
    }

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

  /**
   * Import migrations from drizzle-kit format to drizzle-tx-migrations format.
   *
   * Drizzle-kit migrations are stored as:
   * - drizzle/XXXX_migration_name.sql (SQL files with --> statement-breakpoint separators)
   * - drizzle/meta/_journal.json (migration history)
   *
   * This method converts them to TypeScript/JavaScript migration files with up/down functions.
   */
  async importFromDrizzleKit(
    drizzleKitFolder: string,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const { outputFormat = 'ts', markAsExecuted = false } = options;
    const result: ImportResult = {
      imported: [],
      skipped: [],
      errors: [],
    };

    // Validate drizzle-kit folder
    if (!fs.existsSync(drizzleKitFolder)) {
      throw new Error(`Drizzle-kit folder not found: ${drizzleKitFolder}`);
    }

    const journalPath = path.join(drizzleKitFolder, 'meta', '_journal.json');
    if (!fs.existsSync(journalPath)) {
      throw new Error(
        `Drizzle-kit journal not found: ${journalPath}. Is this a valid drizzle-kit migrations folder?`
      );
    }

    // Read journal to get migration order
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
    const entries: Array<{ idx: number; tag: string; when: number }> = journal.entries || [];

    if (entries.length === 0) {
      console.log('No migrations found in drizzle-kit journal.');
      return result;
    }

    console.log(`Found ${entries.length} drizzle-kit migration(s) to import.\n`);

    this.ensureMigrationsFolder();

    // Process each migration
    for (const entry of entries) {
      const sqlFile = path.join(drizzleKitFolder, `${entry.tag}.sql`);

      if (!fs.existsSync(sqlFile)) {
        result.errors.push(`SQL file not found: ${sqlFile}`);
        continue;
      }

      try {
        const migrationName = this.extractMigrationName(entry.tag);
        const timestamp = entry.when;
        const fileName = `${timestamp}_${migrationName}`;
        const extension = outputFormat === 'js' ? 'js' : 'ts';
        const outputPath = path.join(this.migrationsFolder, `${fileName}.${extension}`);

        // Check if already exists
        const existingFiles = await glob(`*_${migrationName}.{ts,js}`, {
          cwd: this.migrationsFolder,
        });

        if (existingFiles.length > 0) {
          result.skipped.push({ name: entry.tag, reason: 'already exists' });
          continue;
        }

        // Read SQL content
        const sqlContent = fs.readFileSync(sqlFile, 'utf-8');
        const statements = this.parseDrizzleKitSQL(sqlContent);

        // Generate migration file
        const content = this.generateImportedMigration(migrationName, statements, outputFormat);
        fs.writeFileSync(outputPath, content);

        result.imported.push({
          originalName: entry.tag,
          newName: fileName,
          path: outputPath,
        });

        console.log(`✓ Imported: ${entry.tag} -> ${fileName}.${extension}`);
      } catch (error: any) {
        result.errors.push(`Failed to import ${entry.tag}: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Parse drizzle-kit SQL file content.
   * Drizzle-kit uses "--> statement-breakpoint" as separator.
   */
  private parseDrizzleKitSQL(content: string): string[] {
    // Split by statement breakpoint marker
    const statements = content
      .split(/-->\s*statement-breakpoint/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    return statements;
  }

  /**
   * Extract a clean migration name from drizzle-kit tag.
   * Example: "0000_tired_nitro" -> "tired_nitro"
   */
  private extractMigrationName(tag: string): string {
    // Remove leading index (e.g., "0000_") if present
    const withoutIndex = tag.replace(/^\d+_/, '');
    return this.sanitizeName(withoutIndex);
  }

  /**
   * Generate migration file content from imported SQL statements.
   * Note: Down migrations cannot be auto-generated from drizzle-kit,
   * so we provide placeholder comments.
   */
  private generateImportedMigration(
    name: string,
    statements: string[],
    outputFormat: 'ts' | 'js' = 'ts'
  ): string {
    // Escape backticks and dollar signs
    const escapeSql = (sqlStr: string) => sqlStr.replace(/`/g, '\\`').replace(/\$/g, '\\$');

    const upSQL = statements
      .map((stmt) => `  await db.execute(sql\`${escapeSql(stmt)}\`);`)
      .join('\n');

    // Try to generate reverse statements for simple DDL
    const downStatements = this.generateReverseStatements(statements);
    const downSQL =
      downStatements.length > 0
        ? downStatements.map((stmt) => `  await db.execute(sql\`${escapeSql(stmt)}\`);`).join('\n')
        : '  // TODO: Implement down migration\n  // This migration was imported from drizzle-kit and requires manual down implementation.';

    if (outputFormat === 'js') {
      return `/**
 * Migration: ${name}
 *
 * This migration was imported from drizzle-kit.
 * Please review the down() function and implement rollback logic if needed.
 */

async function up({ db, sql }) {
${upSQL}
}

async function down({ db, sql }) {
${downSQL}
}

module.exports = { up, down };
`;
    }

    return `import { type MigrationContext } from 'drizzle-tx-migrations';

/**
 * Migration: ${name}
 *
 * This migration was imported from drizzle-kit.
 * Please review the down() function and implement rollback logic if needed.
 */

export async function up({ db, sql }: MigrationContext): Promise<void> {
${upSQL}
}

export async function down({ db, sql }: MigrationContext): Promise<void> {
${downSQL}
}

export default { up, down };
`;
  }

  /**
   * Attempt to generate reverse statements for common DDL operations.
   * This is a best-effort approach for simple cases.
   *
   * The order of operations for down migration is critical:
   * 1. Drop foreign keys first (they may depend on indexes)
   * 2. Drop indexes
   * 3. Drop columns
   * 4. Drop tables last
   */
  private generateReverseStatements(statements: string[]): string[] {
    const dropForeignKeys: string[] = [];
    const dropIndexes: string[] = [];
    const dropColumns: string[] = [];
    const dropTables: string[] = [];

    // Process in reverse order to get correct dependency order within each category
    for (let i = statements.length - 1; i >= 0; i--) {
      const stmt = statements[i].trim();
      const upperStmt = stmt.toUpperCase();

      // CREATE TABLE -> DROP TABLE
      if (upperStmt.startsWith('CREATE TABLE')) {
        const match = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?/i);
        if (match) {
          const tableName = match[1];
          const quoted = this.dialect === 'mysql' ? `\`${tableName}\`` : `"${tableName}"`;
          dropTables.push(`DROP TABLE IF EXISTS ${quoted}`);
        }
      }
      // ALTER TABLE ADD COLUMN -> ALTER TABLE DROP COLUMN
      else if (
        upperStmt.includes('ADD COLUMN') ||
        upperStmt.match(/ALTER\s+TABLE.*ADD\s+[`"]\w+[`"]/)
      ) {
        const tableMatch = stmt.match(/ALTER\s+TABLE\s+[`"]?(\w+)[`"]?/i);
        const columnMatch = stmt.match(/ADD\s+(?:COLUMN\s+)?[`"]?(\w+)[`"]?/i);
        if (tableMatch && columnMatch) {
          const tableName = tableMatch[1];
          const columnName = columnMatch[1];
          const tableQuoted = this.dialect === 'mysql' ? `\`${tableName}\`` : `"${tableName}"`;
          const colQuoted = this.dialect === 'mysql' ? `\`${columnName}\`` : `"${columnName}"`;
          dropColumns.push(`ALTER TABLE ${tableQuoted} DROP COLUMN ${colQuoted}`);
        }
      }
      // ALTER TABLE ADD CONSTRAINT/FOREIGN KEY -> ALTER TABLE DROP CONSTRAINT/FOREIGN KEY
      else if (upperStmt.includes('ADD CONSTRAINT') || upperStmt.includes('ADD FOREIGN KEY')) {
        const tableMatch = stmt.match(/ALTER\s+TABLE\s+[`"]?(\w+)[`"]?/i);
        const constraintMatch = stmt.match(/ADD\s+CONSTRAINT\s+[`"]?(\w+)[`"]?/i);
        if (tableMatch && constraintMatch) {
          const tableName = tableMatch[1];
          const constraintName = constraintMatch[1];
          const tableQuoted = this.dialect === 'mysql' ? `\`${tableName}\`` : `"${tableName}"`;
          const constQuoted =
            this.dialect === 'mysql' ? `\`${constraintName}\`` : `"${constraintName}"`;
          if (this.dialect === 'mysql') {
            // MySQL uses DROP FOREIGN KEY for FK constraints
            if (upperStmt.includes('FOREIGN KEY')) {
              dropForeignKeys.push(`ALTER TABLE ${tableQuoted} DROP FOREIGN KEY ${constQuoted}`);
            } else {
              dropIndexes.push(`ALTER TABLE ${tableQuoted} DROP INDEX ${constQuoted}`);
            }
          } else {
            dropForeignKeys.push(`ALTER TABLE ${tableQuoted} DROP CONSTRAINT ${constQuoted}`);
          }
        }
      }
      // CREATE INDEX -> DROP INDEX
      else if (
        upperStmt.startsWith('CREATE INDEX') ||
        upperStmt.startsWith('CREATE UNIQUE INDEX')
      ) {
        // Match: CREATE INDEX idx_name ON table_name (columns)
        const indexMatch = stmt.match(
          /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s+ON\s+[`"]?(\w+)[`"]?/i
        );
        if (indexMatch) {
          const indexName = indexMatch[1];
          const tableName = indexMatch[2];
          if (this.dialect === 'mysql') {
            // MySQL: DROP INDEX index_name ON table_name
            dropIndexes.push(`DROP INDEX \`${indexName}\` ON \`${tableName}\``);
          } else {
            // PostgreSQL/SQLite: DROP INDEX IF EXISTS index_name
            dropIndexes.push(`DROP INDEX IF EXISTS "${indexName}"`);
          }
        }
      }
    }

    // Return in correct order: foreign keys -> indexes -> columns -> tables
    return [...dropForeignKeys, ...dropIndexes, ...dropColumns, ...dropTables];
  }
}
