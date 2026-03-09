/**
 * Custom error classes for drizzle-tx-migrations
 */

/** Base error class for all migration-related errors */
export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'MigrationError';
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/** Error thrown when schema loading fails */
export class SchemaLoadError extends MigrationError {
  constructor(
    message: string,
    public readonly schemaPath?: string,
    cause?: Error
  ) {
    super(message, cause);
    this.name = 'SchemaLoadError';
  }
}

/** Error thrown when database introspection fails */
export class IntrospectionError extends MigrationError {
  constructor(
    message: string,
    public readonly dialect?: string,
    cause?: Error
  ) {
    super(message, cause);
    this.name = 'IntrospectionError';
  }
}

/** Error thrown when migration generation fails */
export class GeneratorError extends MigrationError {
  constructor(
    message: string,
    public readonly migrationName?: string,
    cause?: Error
  ) {
    super(message, cause);
    this.name = 'GeneratorError';
  }
}

/** Error thrown when migration execution fails */
export class ExecutionError extends MigrationError {
  constructor(
    message: string,
    public readonly migrationName?: string,
    cause?: Error
  ) {
    super(message, cause);
    this.name = 'ExecutionError';
  }
}
