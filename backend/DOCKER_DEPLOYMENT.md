# Docker Deployment Guide

## Overview

The PayCrypt backend Docker image includes:
- Node.js 18 Alpine base
- Application code and dependencies
- Database migration scripts
- Seed data scripts (categorized as production-safe or demo-only)

The image does **NOT** include seed data by default. Migrations and seeding are triggered via environment variables at startup.

---

## Build Image

```bash
# Build from backend directory
cd backend
docker build -t paycrypt-backend:latest .

# Or from repository root
docker build -f backend/Dockerfile -t paycrypt-backend:latest backend
```

---

## Run Container

### Basic Usage (No Migrations/Seeds)

Starts the application without running migrations or seeds:

```bash
docker run \
  -e NODE_ENV=production \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=paycrypt \
  -e DB_USER=paycrypt \
  -e DB_PASSWORD=<secret> \
  -e JWT_SECRET=<secret> \
  -p 3000:3000 \
  paycrypt-backend:latest
```

### Production Deployment (Migrations Only)

Runs migrations at startup, then starts the application:

```bash
docker run \
  -e NODE_ENV=production \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=paycrypt \
  -e DB_USER=paycrypt \
  -e DB_PASSWORD=<secret> \
  -e JWT_SECRET=<secret> \
  -e MIGRATE_ON_START=prod \
  -p 3000:3000 \
  paycrypt-backend:latest
```

### Production Deployment (Migrations + Production-Safe Seeds)

Runs migrations and loads essential production-safe seeds:

```bash
docker run \
  -e NODE_ENV=production \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=paycrypt \
  -e DB_USER=paycrypt \
  -e DB_PASSWORD=<secret> \
  -e JWT_SECRET=<secret> \
  -e MIGRATE_ON_START=prod \
  -e SEED_ON_START=prod \
  -p 3000:3000 \
  paycrypt-backend:latest
```

### Development/Staging (Migrations + All Seeds)

Runs migrations and loads all seeds including demo data:

```bash
docker run \
  -e NODE_ENV=development \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=paycrypt_dev \
  -e DB_USER=paycrypt \
  -e DB_PASSWORD=<secret> \
  -e JWT_SECRET=<secret> \
  -e MIGRATE_ON_START=true \
  -e SEED_ON_START=demo \
  -p 3000:3000 \
  paycrypt-backend:latest
```

---

## Environment Variables

### Startup Control

| Variable | Values | Default | Purpose |
|----------|--------|---------|---------|
| `MIGRATE_ON_START` | `true`, `prod` | unset | Run migrations at startup |
| `SEED_ON_START` | `prod`, `demo` | unset | Load seeds at startup |

**Important:** 
- `MIGRATE_ON_START=prod` works in any environment (production, staging, dev)
- `SEED_ON_START=prod` loads only production-safe seeds (tokens, chains)
- `SEED_ON_START=demo` loads all seeds including demo data—**never use in production**

### Database Configuration

| Variable | Example | Required |
|----------|---------|----------|
| `DB_HOST` | `localhost` | Yes |
| `DB_PORT` | `5432` | Yes |
| `DB_NAME` | `paycrypt` | Yes |
| `DB_USER` | `paycrypt` | Yes |
| `DB_PASSWORD` | `<secret>` | Yes |

### Application Configuration

| Variable | Values | Default |
|----------|--------|---------|
| `NODE_ENV` | `production`, `development`, `test` | `production` |
| `JWT_SECRET` | Secret key (32+ chars) | Required in production |

---

## Kubernetes Deployment Example

For Kubernetes, use an init container to run migrations before the application starts:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: paycrypt-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: paycrypt-backend
  template:
    metadata:
      labels:
        app: paycrypt-backend
    spec:
      # Init container: run migrations before app starts
      initContainers:
      - name: db-migrate
        image: paycrypt-backend:latest
        env:
        - name: NODE_ENV
          value: "production"
        - name: DB_HOST
          value: "postgres.default.svc.cluster.local"
        - name: DB_PORT
          value: "5432"
        - name: DB_NAME
          value: "paycrypt"
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: paycrypt-db
              key: username
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: paycrypt-db
              key: password
        - name: MIGRATE_ON_START
          value: "prod"
        - name: SEED_ON_START
          value: "prod"
        command: ["/usr/local/bin/docker-entrypoint.sh"]
      
      # Main application container
      containers:
      - name: paycrypt-backend
        image: paycrypt-backend:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DB_HOST
          value: "postgres.default.svc.cluster.local"
        - name: DB_PORT
          value: "5432"
        - name: DB_NAME
          value: "paycrypt"
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: paycrypt-db
              key: username
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: paycrypt-db
              key: password
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: paycrypt-app
              key: jwt-secret
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

---

## Docker Compose Example

For local development with PostgreSQL:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: paycrypt_dev
      POSTGRES_USER: paycrypt
      POSTGRES_PASSWORD: devpass123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:6
    ports:
      - "6379:6379"

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    environment:
      NODE_ENV: development
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: paycrypt_dev
      DB_USER: paycrypt
      DB_PASSWORD: devpass123
      JWT_SECRET: dev_jwt_secret_minimum_32_characters_long
      REDIS_HOST: redis
      REDIS_PORT: 6379
      MIGRATE_ON_START: "true"
      SEED_ON_START: "demo"
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
    command: npm start

volumes:
  postgres_data:
```

Run with:
```bash
docker-compose up
```

---

## Best Practices

### Production

1. **Separate migration container**: Run migrations in an init container before the app starts
2. **Production-safe seeds only**: Use `SEED_ON_START=prod` to load only tokens and chains
3. **No demo data**: Never set `SEED_ON_START=demo` in production
4. **Health checks**: Configure liveness/readiness probes to detect startup failures
5. **Environment variables**: Store secrets (DB_PASSWORD, JWT_SECRET) in a secrets manager

### Development/Staging

1. **All seeds**: Use `SEED_ON_START=demo` to load demo data for testing
2. **Fresh database**: Run migrations and seeds together with `MIGRATE_ON_START=true`
3. **Docker Compose**: Use docker-compose for local development with all services

### CI/CD

1. **No automatic migration**: Docker image build should NOT run migrations
2. **Deployment-time seeding**: Let orchestrator (Kubernetes, ECS, etc.) control migrations/seeds
3. **Regression tests**: Verify demo data is never loaded in production scripts

---

## Troubleshooting

### Container exits after migration
- Check logs: `docker logs <container-id>`
- Verify database connectivity: `docker exec <container-id> npm run migrate:status`
- Ensure DB_HOST, DB_PORT, DB_USER, DB_PASSWORD are correct

### "FATAL: role does not exist"
- Database user doesn't exist. Create it in PostgreSQL:
  ```sql
  CREATE ROLE paycrypt WITH LOGIN PASSWORD 'password';
  GRANT ALL PRIVILEGES ON DATABASE paycrypt TO paycrypt;
  ```

### Demo data appearing in production
- Check `SEED_ON_START` is set to `prod`, not `demo`
- Query database to verify: See [Seed Categorization](./docs/SEED_CATEGORIZATION.md)

---

## Related Documentation

- [Seed Categorization](./docs/SEED_CATEGORIZATION.md) - Production-safe vs demo seeds
- [Rollback Guide](./docs/ROLLBACK_GUIDE.md) - Migration rollback procedures
- [Setup Guide](../docs/setup_guide.md) - Local development setup
