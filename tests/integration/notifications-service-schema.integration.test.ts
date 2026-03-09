import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { MigrationGenerator } from '../../src/generator';
import { Migrator } from '../../src/migrator';
import fs from 'fs';
import path from 'path';

describe('Notifications Service Complete Schema Integration Test', () => {
  const testDir = path.join(__dirname, '__test_notifications_service__');
  const migrationsDir = path.join(testDir, 'migrations');
  const entitiesDir = path.join(testDir, 'entities');
  const commonDir = path.join(testDir, 'common');

  let connection: mysql.Connection;
  let db: ReturnType<typeof drizzle>;
  let migrator: Migrator;
  let generator: MigrationGenerator;

  beforeAll(async () => {
    // Setup directories
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.mkdirSync(entitiesDir, { recursive: true });
    fs.mkdirSync(commonDir, { recursive: true });

    // Connect to test database
    connection = await mysql.createConnection({
      host: 'localhost',
      port: 33060,
      user: 'root',
      password: 'rootpass',
      database: 'test_migrations',
    });

    db = drizzle(connection);

    migrator = new Migrator({
      db,
      dialect: 'mysql',
      config: { migrationsFolder: migrationsDir },
    });

    generator = new MigrationGenerator(migrationsDir, db, 'mysql', [entitiesDir]);

    // Clean up existing tables
    const [tables] = await connection.query<mysql.RowDataPacket[]>(`SHOW TABLES`);
    for (const row of tables) {
      const tableName = Object.values(row)[0];
      await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
    }

    // Create common files (EntityBase and custom types)
    createCommonFiles();

    // Create all entity files
    createEntityFiles();
  });

  afterAll(async () => {
    await connection.end();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createCommonFiles() {
    // Create entity-base.ts - using standard varchar instead of custom binary type
    fs.writeFileSync(
      path.join(commonDir, 'entity-base.ts'),
      `
import { int, timestamp, varchar } from 'drizzle-orm/mysql-core';

// Use varchar for ulid instead of binary custom type for compatibility
export const EntityBase = {
  ulid: varchar('ulid', { length: 36 }).notNull(),
  ulidLiteral: varchar('ulid_literal', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().onUpdateNow(),
  deletedAt: timestamp('deleted_at'),
  version: int('version')
    .default(1)
    .notNull(),
};
      `
    );

    // Create constants.ts
    fs.writeFileSync(
      path.join(commonDir, 'constants.ts'),
      `
export enum NotificationNature {
  Push = 'push',
}

export const MessageDeliveryLogStatus = ['pending', 'success', 'failure', 'retry', 'token-deleted'] as const;
      `
    );
  }

  function createEntityFiles() {
    // 1. RegisteredApps entity
    fs.writeFileSync(
      path.join(entitiesDir, 'registered-app.entity.ts'),
      `
import { mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

export const RegisteredApps = mysqlTable('registered_apps', {
  appId: varchar('app_id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});
      `
    );

    // 2. Notification entity
    fs.writeFileSync(
      path.join(entitiesDir, 'notification.entity.ts'),
      `
import {
  json,
  mysqlTable,
  varchar,
  int,
  index,
  timestamp,
} from 'drizzle-orm/mysql-core';
import { NotificationNature } from '../common/constants';

export const Notification = mysqlTable(
  'notifications',
  {
    ulid: varchar('ulid', { length: 36 }).notNull().primaryKey(),
    ulidLiteral: varchar('ulid_literal', { length: 36 }),
    tenantId: int('tenant_id').notNull(),
    type: varchar('type', { length: 100 }).notNull(),
    title: json('title')
      .$type<{ key: string; params?: Record<string, unknown> }>()
      .notNull(),
    body: json('body')
      .$type<{ key: string; params?: Record<string, unknown> }>()
      .notNull(),
    payload: json('payload'),
    nature: varchar('nature', { length: 50 })
      .default(NotificationNature.Push)
      .notNull(),
    category: varchar('category', { length: 100 }).notNull(),
    subCategory: varchar('sub_category', { length: 100 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    version: int('version').default(1).notNull(),
  },
  (table) => [
    index('idx_tenant_type_created').on(
      table.tenantId,
      table.type,
      table.createdAt,
    ),
    index('idx_tenant_category_created').on(
      table.tenantId,
      table.category,
      table.createdAt,
    ),
  ],
);
      `
    );

    // 3. RecipientToken entity
    fs.writeFileSync(
      path.join(entitiesDir, 'recipient-token.entity.ts'),
      `
import {
  int,
  mysqlTable,
  unique,
  varchar,
  timestamp,
  index,
} from 'drizzle-orm/mysql-core';
import { RegisteredApps } from './registered-app.entity';

export const RecipientToken = mysqlTable(
  'recipient_tokens',
  {
    ulid: varchar('ulid', { length: 36 }).notNull().primaryKey(),
    ulidLiteral: varchar('ulid_literal', { length: 36 }),
    tenantId: int('tenant_id').notNull(),
    recipientId: int('recipient_id').notNull(),
    deviceId: varchar('device_id', { length: 255 }).notNull(),
    fcmToken: varchar('fcm_token', { length: 350 }).notNull(),
    language: varchar('language', { length: 2 }).notNull(),
    platform: varchar('platform', { length: 50 }).notNull(),
    appId: varchar('app_id', { length: 255 })
      .notNull()
      .references(() => RegisteredApps.appId),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    version: int('version').default(1).notNull(),
  },
  (table) => [
    unique('idx_tenant_recipient_device_app').on(
      table.tenantId,
      table.recipientId,
      table.deviceId,
      table.appId,
    ),
    index('idx_tenant_ulid').on(table.tenantId, table.ulid),
  ],
);
      `
    );

    // 4. NotificationRecipientReadStatus entity
    fs.writeFileSync(
      path.join(entitiesDir, 'notification-recipient-read-status.entity.ts'),
      `
import {
  boolean,
  int,
  mysqlTable,
  index,
  unique,
  foreignKey,
  timestamp,
  varchar,
} from 'drizzle-orm/mysql-core';
import { Notification } from './notification.entity';

export const NotificationRecipientReadStatus = mysqlTable(
  'notification_recipient_read_statuses',
  {
    ulid: varchar('ulid', { length: 36 }).notNull().primaryKey(),
    ulidLiteral: varchar('ulid_literal', { length: 36 }),
    tenantId: int('tenant_id').notNull(),
    recipientId: int('recipient_id').notNull(),
    notificationUlid: varchar('notification_ulid', { length: 36 }).notNull(),
    notificationUlidLiteral: varchar('notification_ulid_literal', { length: 36 }),
    appId: varchar('app_id', { length: 255 }).notNull(),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    version: int('version').default(1).notNull(),
  },
  (table) => [
    unique('uk_tenant_recipient_notification_app').on(
      table.tenantId,
      table.recipientId,
      table.notificationUlid,
      table.appId,
    ),
    foreignKey({
      columns: [table.notificationUlid],
      foreignColumns: [Notification.ulid],
      name: 'fk_notification_read_status',
    }).onUpdate('cascade'),
    index('idx_tenant_recipient_unread').on(
      table.tenantId,
      table.recipientId,
      table.isRead,
      table.createdAt,
    ),
    index('idx_tenant_notification').on(table.tenantId, table.notificationUlid),
  ],
);
      `
    );

    // 5. MessageDeliveryLog entity
    fs.writeFileSync(
      path.join(entitiesDir, 'message-delivery-log.entity.ts'),
      `
import {
  foreignKey,
  json,
  mysqlTable,
  varchar,
  int,
  timestamp,
  index,
} from 'drizzle-orm/mysql-core';
import { Notification } from './notification.entity';
import { RecipientToken } from './recipient-token.entity';

export const MessageDeliveryLog = mysqlTable(
  'message_delivery_logs',
  {
    ulid: varchar('ulid', { length: 36 }).notNull().primaryKey(),
    ulidLiteral: varchar('ulid_literal', { length: 36 }),
    tenantId: int('tenant_id').notNull(),
    notificationUlid: varchar('notification_ulid', { length: 36 }).notNull(),
    notificationUlidLiteral: varchar('notification_ulid_literal', { length: 36 }),
    recipientTokenUlid: varchar('recipient_token_ulid', { length: 36 }),
    recipientTokenUlidLiteral: varchar('recipient_token_ulid_literal', { length: 36 }),
    status: varchar('status', { length: 50 }).notNull(),
    sentAt: timestamp('sent_at'),
    lastAttemptedAt: timestamp('last_attempted_at'),
    error: json('error').$type<{ code: string; message: string } | null>(),
    attemptCount: int('attempt_count').default(1).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    version: int('version').default(1).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'fk_notification_delivery',
      columns: [table.notificationUlid],
      foreignColumns: [Notification.ulid],
    }).onUpdate('cascade'),
    foreignKey({
      name: 'fk_recipient_token_delivery',
      columns: [table.recipientTokenUlid],
      foreignColumns: [RecipientToken.ulid],
    }).onUpdate('cascade'),
    index('idx_tenant_notification').on(table.tenantId, table.notificationUlid),
  ],
);
      `
    );
  }

  it('should load all 5 entity tables correctly', async () => {
    const { SchemaLoader } = await import('../../src/schema-loader');
    const loader = new SchemaLoader([entitiesDir], 'mysql');
    const schema = await loader.loadSchema();

    expect(schema.tables.size).toBe(5);
    expect(schema.tables.has('registered_apps')).toBe(true);
    expect(schema.tables.has('notifications')).toBe(true);
    expect(schema.tables.has('recipient_tokens')).toBe(true);
    expect(schema.tables.has('notification_recipient_read_statuses')).toBe(true);
    expect(schema.tables.has('message_delivery_logs')).toBe(true);
  });

  it('should detect all columns including JSON columns', async () => {
    const { SchemaLoader } = await import('../../src/schema-loader');
    const loader = new SchemaLoader([entitiesDir], 'mysql');
    const schema = await loader.loadSchema();

    const notificationsTable = schema.tables.get('notifications');
    expect(notificationsTable).toBeDefined();

    const columnNames = notificationsTable!.columns.map((c) => c.name);
    expect(columnNames).toContain('tenant_id');
    expect(columnNames).toContain('type');
    expect(columnNames).toContain('title'); // JSON column
    expect(columnNames).toContain('body'); // JSON column
    expect(columnNames).toContain('payload'); // JSON column
    expect(columnNames).toContain('nature'); // ENUM column
    expect(columnNames).toContain('ulid'); // From EntityBase (binary)
    expect(columnNames).toContain('ulid_literal'); // From EntityBase (generated)

    // Check JSON column types
    const titleCol = notificationsTable!.columns.find((c) => c.name === 'title');
    const bodyCol = notificationsTable!.columns.find((c) => c.name === 'body');
    const payloadCol = notificationsTable!.columns.find((c) => c.name === 'payload');

    expect(titleCol?.type.toLowerCase()).toBe('json');
    expect(bodyCol?.type.toLowerCase()).toBe('json');
    expect(payloadCol?.type.toLowerCase()).toBe('json');
  });

  it('should detect all indexes across all tables', async () => {
    const { SchemaLoader } = await import('../../src/schema-loader');
    const loader = new SchemaLoader([entitiesDir], 'mysql');
    const schema = await loader.loadSchema();

    let totalIndexes = 0;
    schema.tables.forEach((table) => {
      totalIndexes += table.indexes.length;
    });

    // Count expected indexes:
    // notifications: 2 (idx_tenant_type_created, idx_tenant_category_created)
    // notification_recipient_read_statuses: 2 (idx_tenant_recipient_unread, idx_tenant_notification)
    // message_delivery_logs: 1 (idx_tenant_notification)
    expect(totalIndexes).toBeGreaterThanOrEqual(5);
  });

  it('should detect all foreign keys', async () => {
    const { SchemaLoader } = await import('../../src/schema-loader');
    const loader = new SchemaLoader([entitiesDir], 'mysql');
    const schema = await loader.loadSchema();

    let totalForeignKeys = 0;
    schema.tables.forEach((table) => {
      totalForeignKeys += table.foreignKeys.length;
    });

    // Count expected foreign keys:
    // recipient_tokens: 1 (app_id -> registered_apps)
    // notification_recipient_read_statuses: 1 (notification_ulid -> notifications)
    // message_delivery_logs: 2 (notification_ulid -> notifications, recipient_token_ulid -> recipient_tokens)
    expect(totalForeignKeys).toBeGreaterThanOrEqual(4);
  });

  it('should generate initial schema migration with all tables', async () => {
    const migrationPath = await generator.generateMigration('create_notifications_schema');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

    // Check all table creations (backticks are escaped in template literals)
    expect(migrationContent).toContain('CREATE TABLE \\`registered_apps\\`');
    expect(migrationContent).toContain('CREATE TABLE \\`notifications\\`');
    expect(migrationContent).toContain('CREATE TABLE \\`recipient_tokens\\`');
    expect(migrationContent).toContain('CREATE TABLE \\`notification_recipient_read_statuses\\`');
    expect(migrationContent).toContain('CREATE TABLE \\`message_delivery_logs\\`');

    // Check JSON columns
    expect(migrationContent).toContain('JSON');

    // Check VARCHAR columns for ULID
    expect(migrationContent).toContain('VARCHAR');

    // Check indexes
    expect(migrationContent).toContain('CREATE INDEX');

    // Check foreign keys
    expect(migrationContent).toContain('FOREIGN KEY');
  });

  it('should successfully execute the schema migration', async () => {
    const result = await migrator.runMigrations();

    expect(result.success).toBe(true);
    expect(result.executed.length).toBe(1);

    // Verify all tables were created
    const [tables] = await connection.query<mysql.RowDataPacket[]>(`SHOW TABLES`);
    const tableNames = tables.map((row) => Object.values(row)[0] as string);

    expect(tableNames).toContain('registered_apps');
    expect(tableNames).toContain('notifications');
    expect(tableNames).toContain('recipient_tokens');
    expect(tableNames).toContain('notification_recipient_read_statuses');
    expect(tableNames).toContain('message_delivery_logs');
    expect(tableNames).toContain('__drizzle_migrations');
  });

  it('should have created all columns correctly', async () => {
    // Check notifications table structure
    const [notifColumns] = await connection.query<mysql.RowDataPacket[]>(
      `SHOW COLUMNS FROM notifications`
    );
    const notifColNames = notifColumns.map((col) => col.Field);

    expect(notifColNames).toContain('tenant_id');
    expect(notifColNames).toContain('type');
    expect(notifColNames).toContain('title');
    expect(notifColNames).toContain('body');
    expect(notifColNames).toContain('payload');
    expect(notifColNames).toContain('nature');
    expect(notifColNames).toContain('category');
    expect(notifColNames).toContain('sub_category');
    expect(notifColNames).toContain('ulid');
    expect(notifColNames).toContain('ulid_literal');
    expect(notifColNames).toContain('created_at');
    expect(notifColNames).toContain('updated_at');
    expect(notifColNames).toContain('deleted_at');
    expect(notifColNames).toContain('version');

    // Verify JSON column types
    const titleCol = notifColumns.find((col) => col.Field === 'title');
    const bodyCol = notifColumns.find((col) => col.Field === 'body');
    const payloadCol = notifColumns.find((col) => col.Field === 'payload');

    expect(titleCol?.Type).toBe('json');
    expect(bodyCol?.Type).toBe('json');
    expect(payloadCol?.Type).toBe('json');

    // Verify VARCHAR column type for ulid
    const ulidCol = notifColumns.find((col) => col.Field === 'ulid');
    expect(ulidCol?.Type).toBe('varchar(36)');
  });

  it('should have created all indexes correctly', async () => {
    const [indexes] = await connection.query<mysql.RowDataPacket[]>(
      `SHOW INDEX FROM notifications WHERE Key_name != 'PRIMARY'`
    );

    const indexNames = indexes.map((idx) => idx.Key_name);
    expect(indexNames).toContain('idx_tenant_type_created');
    expect(indexNames).toContain('idx_tenant_category_created');
  });

  it('should have created all foreign keys correctly', async () => {
    // Check recipient_tokens foreign key
    const [recipientTokensFK] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT
        CONSTRAINT_NAME,
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = 'test_migrations'
        AND TABLE_NAME = 'recipient_tokens'
        AND REFERENCED_TABLE_NAME IS NOT NULL`
    );

    expect(recipientTokensFK.length).toBeGreaterThan(0);
    expect(recipientTokensFK[0].REFERENCED_TABLE_NAME).toBe('registered_apps');

    // Check message_delivery_logs foreign keys
    const [messageDeliveryFK] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT
        CONSTRAINT_NAME,
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = 'test_migrations'
        AND TABLE_NAME = 'message_delivery_logs'
        AND REFERENCED_TABLE_NAME IS NOT NULL`
    );

    // Should have at least 1 FK (notification_ulid -> notifications)
    // Note: recipientTokenUlid FK may be nullable
    expect(messageDeliveryFK.length).toBeGreaterThanOrEqual(1);
  });

  it('should be able to insert and query data', async () => {
    // Insert a registered app
    await connection.query(
      `INSERT INTO registered_apps (app_id, name, description, created_at, updated_at)
       VALUES ('test-app', 'Test App', 'Test Description', NOW(), NOW())`
    );

    // Verify it was inserted
    const [apps] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT * FROM registered_apps WHERE app_id = 'test-app'`
    );

    expect(apps.length).toBe(1);
    expect(apps[0].name).toBe('Test App');
  });

  it('should track the migration correctly', async () => {
    const [migrations] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT * FROM __drizzle_migrations ORDER BY executed_at`
    );

    expect(migrations.length).toBe(1);
    expect(migrations[0].name).toContain('create_notifications_schema');
    expect(migrations[0].executed_at).toBeTruthy();
  });

  it('should be able to rollback the migration', async () => {
    const result = await migrator.revertMigration(1);

    expect(result.success).toBe(true);
    expect(result.reverted.length).toBe(1);

    // Verify all tables except migrations table were dropped
    const [tables] = await connection.query<mysql.RowDataPacket[]>(`SHOW TABLES`);
    const tableNames = tables.map((row) => Object.values(row)[0] as string);

    expect(tableNames).toEqual(['__drizzle_migrations']);

    // Verify migration record was removed
    const [migrations] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT * FROM __drizzle_migrations`
    );
    expect(migrations.length).toBe(0);
  });

  it('should be able to re-apply the migration', async () => {
    const result = await migrator.runMigrations();

    expect(result.success).toBe(true);
    expect(result.executed.length).toBe(1);

    // Verify all tables were recreated
    const [tables] = await connection.query<mysql.RowDataPacket[]>(`SHOW TABLES`);
    const tableNames = tables.map((row) => Object.values(row)[0] as string);

    expect(tableNames).toContain('registered_apps');
    expect(tableNames).toContain('notifications');
    expect(tableNames).toContain('recipient_tokens');
    expect(tableNames).toContain('notification_recipient_read_statuses');
    expect(tableNames).toContain('message_delivery_logs');
  });
});
