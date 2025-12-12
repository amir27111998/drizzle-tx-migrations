# CI/CD Integration Example

This example shows how to integrate drizzle-tx-migrations into your CI/CD pipeline.

## Key Commands for CI/CD

### 1. `validate` - Validate Migration Files

Validates migration files without connecting to the database.

```bash
npm run migration:validate
```

**Use case:** Pre-commit hooks, linting

**Exit codes:**
- `0` - All migrations are valid
- `1` - Validation errors found

### 2. `check` - Check Database Status

Validates files AND checks if database has pending migrations.

```bash
npm run migration:check
```

**Use case:** CI/CD pipelines, ensure no migrations missing

**Exit codes:**
- `0` - All valid, no pending migrations
- `1` - Validation errors OR pending migrations exist

### 3. `check --no-fail-pending` - Validate Only

Validates migrations but doesn't fail if there are pending ones.

```bash
drizzle-tx-migrations check --no-fail-pending
```

**Use case:** Development environments

## GitHub Actions

See `.github-workflows-example.yml` for a complete GitHub Actions setup.

### Basic Workflow

```yaml
- name: Check migrations
  run: npx drizzle-tx-migrations check
  env:
    DB_HOST: localhost
    DB_USER: postgres
    DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
    DB_NAME: test_db
```

### Complete Workflow with Database

```yaml
services:
  postgres:
    image: postgres:15
    env:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: test_db
    ports:
      - 5432:5432

steps:
  - name: Validate migrations
    run: npm run migration:validate

  - name: Check migrations
    run: npm run migration:check

  - name: Run migrations
    run: npm run migration:run

  - name: Verify complete
    run: npm run migration:check
```

## GitLab CI

**.gitlab-ci.yml:**
```yaml
check-migrations:
  image: node:18
  services:
    - postgres:15
  variables:
    POSTGRES_DB: test_db
    POSTGRES_PASSWORD: postgres
    DB_HOST: postgres
  script:
    - npm ci
    - npm run build
    - npm run migration:validate
    - npm run migration:check
    - npm run migration:run
    - npm run migration:check
```

## Jenkins

**Jenkinsfile:**
```groovy
pipeline {
  agent any

  stages {
    stage('Validate Migrations') {
      steps {
        sh 'npm run migration:validate'
      }
    }

    stage('Check Migrations') {
      steps {
        sh 'npm run migration:check'
      }
    }

    stage('Run Migrations') {
      when {
        branch 'main'
      }
      steps {
        sh 'npm run migration:run'
      }
    }
  }
}
```

## Pre-commit Hook

**.husky/pre-commit:**
```bash
#!/bin/bash

# Validate migrations before commit
npm run migration:validate || {
  echo "❌ Migration validation failed"
  exit 1
}

echo "✅ Migrations validated"
```

## Docker Compose for Testing

**docker-compose.test.yml:**
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: test_db
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USER: postgres
      DB_PASSWORD: postgres
      DB_NAME: test_db
    command: npm run test:migrations
```

Run tests:
```bash
docker compose -f docker-compose.test.yml up --abort-on-container-exit
```

## Best Practices

### 1. Always Validate First

```json
{
  "scripts": {
    "test:migrations": "npm run migration:validate && npm run migration:check"
  }
}
```

### 2. Fail Fast in CI

```bash
set -e  # Exit on first error

npm run migration:validate
npm run migration:check
npm run migration:run
```

### 3. Use Different Commands for Different Environments

```json
{
  "scripts": {
    "migration:check:ci": "drizzle-tx-migrations check",
    "migration:check:dev": "drizzle-tx-migrations check --no-fail-pending"
  }
}
```

### 4. Test Rollback in Staging

```bash
# In staging environment
npm run migration:run
npm run migration:down
npm run migration:run  # Ensure it's repeatable
```

### 5. Monitor Exit Codes

```bash
if npx drizzle-tx-migrations check; then
  echo "✅ All migrations are up to date"
else
  echo "❌ Migrations need attention"
  exit 1
fi
```

## Notification Example

```bash
#!/bin/bash

if ! npm run migration:check; then
  # Send notification (Slack, email, etc.)
  curl -X POST $SLACK_WEBHOOK \
    -d '{"text":"⚠️ Pending migrations detected in PR"}'
  exit 1
fi
```

## Summary

| Command | Database Required | Fails on Pending | Use Case |
|---------|-------------------|------------------|----------|
| `validate` | ❌ No | ❌ No | Pre-commit, linting |
| `check` | ✅ Yes | ✅ Yes | CI/CD, ensure sync |
| `check --no-fail-pending` | ✅ Yes | ❌ No | Development |
| `status` | ✅ Yes | ❌ No | Information only |
