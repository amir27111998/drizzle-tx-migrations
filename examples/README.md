# Examples

This directory contains various examples showing how to use drizzle-tx-migrations.

## Quick Start

### 1. Local Development Setup

**See [local-development/](./local-development/)** for Docker Compose setup.

```bash
# Start local databases
docker compose up -d

# Access Adminer UI at http://localhost:8080
# PostgreSQL: port 54322
# MySQL: port 33306
```

### 2. Database-Specific Examples

Choose your database:

- **[postgresql/](./postgresql/)** - PostgreSQL configuration examples
- **[mysql/](./mysql/)** - MySQL configuration examples
- **[sqlite/](./sqlite/)** - SQLite configuration examples

### 3. Complete Working Example

**See [full-example/](./full-example/)** for a complete project setup.

```bash
cd full-example
npm install
npm run migration:generate create_users
npm run migration:run
```

### 4. CI/CD Integration

**See [ci-cd/](./ci-cd/)** for GitHub Actions, GitLab CI, and Jenkins examples.

### 5. Programmatic Usage

**See [programmatic-usage.ts](./programmatic-usage.ts)** for using the API directly in code.

### 6. Sample Migrations

**See [sample-migrations/](./sample-migrations/)** for migration file examples:
- Creating tables
- Adding indexes
- Data migrations
- Complex multi-step migrations

## Directory Structure

```
examples/
├── README.md                          # This file
├── local-development/                 # Docker Compose setup guide
├── postgresql/                        # PostgreSQL config
├── mysql/                            # MySQL config
├── sqlite/                           # SQLite config
├── full-example/                     # Complete working project
├── ci-cd/                            # CI/CD integration examples
├── programmatic-usage.ts             # API usage examples
└── sample-migrations/                # Migration file examples
```

## Environment Setup

### Option 1: Docker Compose (Recommended)

```bash
# Start databases
docker compose up -d

# Copy environment file
cp .env.example .env
```

**Ports:**
- PostgreSQL: `54322`
- MySQL: `33306`
- Adminer UI: `8080`

### Option 2: Manual Setup

Install PostgreSQL, MySQL, or use SQLite and update `.env`:

```bash
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=test_db

# MySQL
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_DB=test_db

# SQLite
SQLITE_PATH=./test.db
```

## Common Tasks

### Generate a Migration

```bash
npm run migration:generate create_users_table
```

### Run Migrations

```bash
npm run migration:run
```

### Check Status

```bash
npm run migration:status
```

### Revert Migration

```bash
npm run migration:revert
```

### Validate Migrations

```bash
npm run migration:validate
```

## Testing

### Run Integration Tests

```bash
# Start test databases (different ports)
npm run test:db:up

# Run tests
npm run test:integration

# Stop test databases
npm run test:db:down
```

**Test Ports:**
- PostgreSQL: `54320`
- MySQL: `33060`

## Docker Compose Files

The project includes two Docker Compose files:

| File | Purpose | Ports | Data |
|------|---------|-------|------|
| `docker-compose.yml` | Development | 54322, 33306 | Persistent |
| `docker-compose.test.yml` | Testing | 54320, 33060 | Temporary (tmpfs) |

## Next Steps

1. **Start here:** [local-development/](./local-development/)
2. **See full example:** [full-example/](./full-example/)
3. **Setup CI/CD:** [ci-cd/](./ci-cd/)
4. **Database configs:** [postgresql/](./postgresql/), [mysql/](./mysql/), [sqlite/](./sqlite/)

## Need Help?

- 📖 [Main Documentation](../README.md)
- 🐛 [Report Issues](https://github.com/amir27111998/drizzle-tx-migrations/issues)
- 💬 [Discussions](https://github.com/amir27111998/drizzle-tx-migrations/discussions)
