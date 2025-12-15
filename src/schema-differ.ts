import type {
  DatabaseSchema,
  TableSchema,
  TableColumn,
  TableIndex,
  ForeignKey,
} from './schema-introspector';

export interface SchemaChange {
  type:
    | 'create_table'
    | 'drop_table'
    | 'alter_table'
    | 'create_index'
    | 'drop_index'
    | 'add_foreign_key'
    | 'drop_foreign_key';
  table: string;
  details?: any;
}

export interface TableChange {
  type: 'add_column' | 'drop_column' | 'modify_column';
  column: string;
  details?: any;
}

export class SchemaDiffer {
  constructor(
    private currentSchema: DatabaseSchema,
    private desiredSchema: DatabaseSchema
  ) {}

  diff(): SchemaChange[] {
    const changes: SchemaChange[] = [];

    // Find tables to drop (exist in current but not in desired)
    for (const [tableName, tableSchema] of this.currentSchema.tables) {
      if (!this.desiredSchema.tables.has(tableName)) {
        changes.push({
          type: 'drop_table',
          table: tableName,
          details: { tableSchema },
        });
      }
    }

    // Find tables to create (exist in desired but not in current)
    for (const [tableName, tableSchema] of this.desiredSchema.tables) {
      if (!this.currentSchema.tables.has(tableName)) {
        changes.push({
          type: 'create_table',
          table: tableName,
          details: { tableSchema },
        });

        // Also generate create_index changes for indexes on the new table
        for (const index of tableSchema.indexes) {
          changes.push({
            type: 'create_index',
            table: tableName,
            details: { index },
          });
        }

        // Also generate add_foreign_key changes for foreign keys on the new table
        for (const fk of tableSchema.foreignKeys) {
          changes.push({
            type: 'add_foreign_key',
            table: tableName,
            details: { foreignKey: fk },
          });
        }
      }
    }

    // Find tables to alter (exist in both)
    for (const [tableName, desiredTable] of this.desiredSchema.tables) {
      const currentTable = this.currentSchema.tables.get(tableName);
      if (currentTable) {
        const tableChanges = this.diffTables(currentTable, desiredTable);
        if (tableChanges.length > 0) {
          changes.push({
            type: 'alter_table',
            table: tableName,
            details: { changes: tableChanges, currentTable, desiredTable },
          });
        }

        // Check indexes
        const indexChanges = this.diffIndexes(currentTable, desiredTable, tableName);
        changes.push(...indexChanges);

        // Check foreign keys
        const fkChanges = this.diffForeignKeys(currentTable, desiredTable, tableName);
        changes.push(...fkChanges);
      }
    }

    return changes;
  }

  private diffTables(currentTable: TableSchema, desiredTable: TableSchema): TableChange[] {
    const changes: TableChange[] = [];

    const currentColumns = new Map(currentTable.columns.map((c) => [c.name, c]));
    const desiredColumns = new Map(desiredTable.columns.map((c) => [c.name, c]));

    // Find columns to drop
    for (const [colName, colDef] of currentColumns) {
      if (!desiredColumns.has(colName)) {
        changes.push({
          type: 'drop_column',
          column: colName,
          details: { column: colDef },
        });
      }
    }

    // Find columns to add or modify
    for (const [colName, desiredCol] of desiredColumns) {
      const currentCol = currentColumns.get(colName);

      if (!currentCol) {
        // Column doesn't exist, add it
        changes.push({
          type: 'add_column',
          column: colName,
          details: { column: desiredCol },
        });
      } else if (this.columnsAreDifferent(currentCol, desiredCol)) {
        // Column exists but is different
        changes.push({
          type: 'modify_column',
          column: colName,
          details: { currentColumn: currentCol, desiredColumn: desiredCol },
        });
      }
    }

    return changes;
  }

  private columnsAreDifferent(current: TableColumn, desired: TableColumn): boolean {
    // Normalize types for comparison
    const normalizeType = (type: string) => type.toLowerCase().replace(/\s+/g, '');

    return (
      normalizeType(current.type) !== normalizeType(desired.type) ||
      current.notNull !== desired.notNull ||
      current.primaryKey !== desired.primaryKey ||
      this.defaultsAreDifferent(current.defaultValue, desired.defaultValue)
    );
  }

  private defaultsAreDifferent(current: any, desired: any): boolean {
    // Normalize defaults for comparison
    const normalize = (val: any) => {
      if (val === null || val === undefined) return null;
      if (typeof val === 'string') {
        // Remove quotes and normalize
        return val.replace(/^['"]|['"]$/g, '').trim();
      }
      return String(val);
    };

    return normalize(current) !== normalize(desired);
  }

  private diffIndexes(
    currentTable: TableSchema,
    desiredTable: TableSchema,
    tableName: string
  ): SchemaChange[] {
    const changes: SchemaChange[] = [];

    const currentIndexes = new Map(currentTable.indexes.map((i) => [i.name, i]));
    const desiredIndexes = new Map(desiredTable.indexes.map((i) => [i.name, i]));

    // Find indexes to drop
    for (const [idxName, idxDef] of currentIndexes) {
      if (!desiredIndexes.has(idxName)) {
        changes.push({
          type: 'drop_index',
          table: tableName,
          details: { index: idxDef },
        });
      }
    }

    // Find indexes to create
    for (const [idxName, idxDef] of desiredIndexes) {
      const currentIdx = currentIndexes.get(idxName);
      if (!currentIdx || this.indexesAreDifferent(currentIdx, idxDef)) {
        // If index exists but is different, drop it first
        if (currentIdx) {
          changes.push({
            type: 'drop_index',
            table: tableName,
            details: { index: currentIdx },
          });
        }
        changes.push({
          type: 'create_index',
          table: tableName,
          details: { index: idxDef },
        });
      }
    }

    return changes;
  }

  private indexesAreDifferent(current: TableIndex, desired: TableIndex): boolean {
    return (
      current.unique !== desired.unique ||
      current.columns.length !== desired.columns.length ||
      !current.columns.every((col, i) => col === desired.columns[i])
    );
  }

  private diffForeignKeys(
    currentTable: TableSchema,
    desiredTable: TableSchema,
    tableName: string
  ): SchemaChange[] {
    const changes: SchemaChange[] = [];

    const currentFks = new Map(currentTable.foreignKeys.map((fk) => [fk.name, fk]));
    const desiredFks = new Map(desiredTable.foreignKeys.map((fk) => [fk.name, fk]));

    // Find foreign keys to drop
    for (const [fkName, fkDef] of currentFks) {
      if (!desiredFks.has(fkName)) {
        changes.push({
          type: 'drop_foreign_key',
          table: tableName,
          details: { foreignKey: fkDef },
        });
      }
    }

    // Find foreign keys to create
    for (const [fkName, fkDef] of desiredFks) {
      const currentFk = currentFks.get(fkName);
      if (!currentFk || this.foreignKeysAreDifferent(currentFk, fkDef)) {
        // If FK exists but is different, drop it first
        if (currentFk) {
          changes.push({
            type: 'drop_foreign_key',
            table: tableName,
            details: { foreignKey: currentFk },
          });
        }
        changes.push({
          type: 'add_foreign_key',
          table: tableName,
          details: { foreignKey: fkDef },
        });
      }
    }

    return changes;
  }

  private foreignKeysAreDifferent(current: ForeignKey, desired: ForeignKey): boolean {
    return (
      current.column !== desired.column ||
      current.referencedTable !== desired.referencedTable ||
      current.referencedColumn !== desired.referencedColumn ||
      current.onDelete !== desired.onDelete ||
      current.onUpdate !== desired.onUpdate
    );
  }
}
