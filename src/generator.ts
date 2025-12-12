import * as fs from 'fs';
import * as path from 'path';

export class MigrationGenerator {
  constructor(private migrationsFolder: string) {}

  generateMigration(name: string): string {
    const timestamp = Date.now();
    const fileName = `${timestamp}_${this.sanitizeName(name)}`;
    const fullPath = path.join(this.migrationsFolder, `${fileName}.ts`);

    this.ensureMigrationsFolder();

    const content = this.getMigrationTemplate(name);
    fs.writeFileSync(fullPath, content);

    return fullPath;
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
