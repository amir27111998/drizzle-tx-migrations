# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2024-12-11

### Added
- Initial release
- TypeORM-like migration interface with `up()` and `down()` methods
- Full transaction support for all migrations
- Individual migration rollback (not just batches)
- Support for PostgreSQL, MySQL, and SQLite
- Multi-file schema support
- CLI tool for migration management
- Programmatic API for migrations
- Comprehensive documentation and examples
- Migration status tracking
- Revert to specific migration functionality

### Fixed
- MySQL migration generation issues (vs @drepkovsky/drizzle-migrations)
- Individual rollback support (vs @drepkovsky/drizzle-migrations)
- Better handling of multi-file schemas

### Features

#### Core
- Transaction-based migration execution
- Automatic rollback on failure
- Migration tracking table
- Support for all Drizzle dialects

#### CLI
- `generate <name>` - Create new migration
- `up/run` - Run pending migrations
- `down/revert` - Revert migrations
- `status` - Show migration status
- `list` - List all migrations

#### Programmatic API
- `Migrator` class for running migrations
- `MigrationGenerator` class for creating migration files
- Full TypeScript support with type inference
