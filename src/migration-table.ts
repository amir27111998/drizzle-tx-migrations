import { sql } from 'drizzle-orm';
import type { DbDialect, MigrationMeta } from './types';

export class MigrationTable {
  constructor(
    private db: any,
    private dialect: DbDialect,
    private tableName: string = '__drizzle_migrations'
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
    return this.normalizeRows(result);
  }

  private getSelectQuery(): string {
    const quote = this.dialect === 'mysql' ? '`' : '"';
    return `SELECT * FROM ${quote}${this.tableName}${quote} ORDER BY timestamp ASC`;
  }

  private normalizeRows(result: any): MigrationMeta[] {
    let rows: any[] = [];

    if (Array.isArray(result)) {
      rows = result;
    } else if (result.rows) {
      rows = result.rows;
    } else if (result[0]) {
      rows = result[0];
    }

    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      timestamp: Number(row.timestamp),
      executed_at: row.executed_at ? new Date(row.executed_at) : undefined,
    }));
  }

  async addMigration(name: string, timestamp: number): Promise<void> {
    const query = this.getInsertQuery();
    await this.db.execute(sql.raw(query.replace('$name', name).replace('$timestamp', String(timestamp))));
  }

  private getInsertQuery(): string {
    const quote = this.dialect === 'mysql' ? '`' : '"';

    switch (this.dialect) {
      case 'postgresql':
        return `INSERT INTO ${quote}${this.tableName}${quote} (name, timestamp) VALUES ('$name', $timestamp)`;
      case 'mysql':
        return `INSERT INTO ${quote}${this.tableName}${quote} (name, timestamp) VALUES ('$name', $timestamp)`;
      case 'sqlite':
        return `INSERT INTO ${quote}${this.tableName}${quote} (name, timestamp) VALUES ('$name', $timestamp)`;
    }
  }

  async removeMigration(name: string): Promise<void> {
    const quote = this.dialect === 'mysql' ? '`' : '"';
    const query = `DELETE FROM ${quote}${this.tableName}${quote} WHERE name = '$name'`;
    await this.db.execute(sql.raw(query.replace('$name', name)));
  }
}
