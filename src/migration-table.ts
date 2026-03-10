import { sql } from 'drizzle-orm';
import type { DbDialect, MigrationMeta } from './types';
import { quote } from './utils/dialect-utils';
import { normalizeRows } from './utils/result-normalizer';
import { MIGRATION_TABLE_NAME } from './constants';

export class MigrationTable {
  constructor(
    private db: any,
    private dialect: DbDialect,
    private tableName: string = MIGRATION_TABLE_NAME
  ) {}

  async ensureTable(): Promise<void> {
    const createTableSQL = this.getCreateTableSQL();
    await this.db.execute(sql.raw(createTableSQL));
  }

  private getCreateTableSQL(): string {
    switch (this.dialect) {
      case 'postgresql':
        return `
          CREATE TABLE IF NOT EXISTS "${this.tableName}" (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            timestamp BIGINT NOT NULL,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `;
      case 'mysql':
        return `
          CREATE TABLE IF NOT EXISTS \`${this.tableName}\` (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            timestamp BIGINT NOT NULL,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `;
      case 'sqlite':
        return `
          CREATE TABLE IF NOT EXISTS "${this.tableName}" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            timestamp INTEGER NOT NULL,
            executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `;
    }
  }

  async getExecutedMigrations(): Promise<MigrationMeta[]> {
    const query = this.getSelectQuery();
    const result = await this.db.execute(sql.raw(query));
    return this.mapToMigrationMeta(result);
  }

  private getSelectQuery(): string {
    const quotedTable = quote(this.tableName, this.dialect);
    return `SELECT * FROM ${quotedTable} ORDER BY timestamp ASC`;
  }

  private mapToMigrationMeta(result: any): MigrationMeta[] {
    const rows = normalizeRows(result);
    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      timestamp: Number(row.timestamp),
      executed_at: row.executed_at ? new Date(row.executed_at) : undefined,
    }));
  }

  async addMigration(name: string, timestamp: number): Promise<void> {
    const query = this.getInsertQuery();
    await this.db.execute(
      sql.raw(query.replace('$name', name).replace('$timestamp', String(timestamp)))
    );
  }

  private getInsertQuery(): string {
    const quotedTable = quote(this.tableName, this.dialect);
    return `INSERT INTO ${quotedTable} (name, timestamp) VALUES ('$name', $timestamp)`;
  }

  async removeMigration(name: string): Promise<void> {
    const quotedTable = quote(this.tableName, this.dialect);
    const query = `DELETE FROM ${quotedTable} WHERE name = '$name'`;
    await this.db.execute(sql.raw(query.replace('$name', name)));
  }
}
