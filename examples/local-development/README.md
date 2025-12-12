# Local Development Setup

This guide shows how to set up local databases for testing migrations.

## Quick Start with Docker Compose

The project includes a Docker Compose setup for local development.

### 1. Start Databases

```bash
# From project root
docker compose up -d
```

This starts:
- **PostgreSQL** on port `54322`
- **MySQL** on port `33306`
- **Adminer** (Database UI) on port `8080`

### 2. Access Adminer UI

Open [http://localhost:8080](http://localhost:8080)

**PostgreSQL:**
- System: `PostgreSQL`
- Server: `postgres`
- Username: `postgres`
- Password: `postgres`
- Database: `test_db`

**MySQL:**
- System: `MySQL`
- Server: `mysql`
- Username: `root`
- Password: `password`
- Database: `test_db`

### 3. Use Environment Variables

Copy the example env file:

```bash
cp .env.example .env
```

Your config will automatically use these variables:

```typescript
// drizzle-migrations.config.ts
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '54322'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'test_db',
});
```

### 4. Run Migrations

```bash
npm run migration:generate create_users
npm run migration:run
npm run migration:status
```

### 5. Stop Databases

```bash
# Stop containers (keeps data)
docker compose stop

# Stop and remove containers (keeps data in volumes)
docker compose down

# Remove everything including data
docker compose down -v
```

## Port Reference

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 54322 | Non-standard to avoid conflicts |
| MySQL | 33306 | Non-standard to avoid conflicts |
| Adminer | 8080 | Database management UI |

## Testing vs Development

**Development (`docker compose.yml`):**
- Persistent data (survives restarts)
- Adminer UI included
- Ports: 54322, 33306

**Testing (`docker compose.test.yml`):**
- Temporary data (tmpfs, fast)
- No UI needed
- Ports: 54320, 33060
- Used by `npm run test:integration`

## Manual Database Setup (Without Docker)

### PostgreSQL

```bash
# Create database
createdb -U postgres test_db

# Update .env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=test_db
```

### MySQL

```bash
# Create database
mysql -u root -p -e "CREATE DATABASE test_db;"

# Update .env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DB=test_db
```

### SQLite

```bash
# No setup needed! Just set the path
SQLITE_PATH=./test.db
```

## Troubleshooting

### Port Already in Use

If ports 54322 or 33306 are taken, edit `docker compose.yml`:

```yaml
postgres:
  ports:
    - "54323:5432"  # Change external port

mysql:
  ports:
    - "33307:3306"  # Change external port
```

Then update `.env` to match.

### Can't Connect to Database

```bash
# Check if containers are running
docker compose ps

# View logs
docker compose logs postgres
docker compose logs mysql

# Restart containers
docker compose restart
```

### Reset Everything

```bash
# Stop and remove all data
docker compose down -v

# Start fresh
docker compose up -d
```

## Best Practices

1. **Use .env for local config** - Never commit `.env` (use `.env.example`)
2. **Use Adminer for debugging** - Visual interface helps verify migrations
3. **Keep containers running** - Faster than starting/stopping each time
4. **Regular backups** - If testing production data, backup first
5. **Check ports** - Ensure non-standard ports don't conflict

## Next Steps

- See [../postgresql](../postgresql) for PostgreSQL-specific examples
- See [../mysql](../mysql) for MySQL-specific examples
- See [../ci-cd](../ci-cd) for CI/CD integration
