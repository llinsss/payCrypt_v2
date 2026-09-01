# Local Development Guide

This document covers every step to get a fully working Tagged development
environment from a clean clone, including teardown and data-reset procedures.

Closes #521.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start — Dev Container (recommended)](#quick-start--dev-container-recommended)
3. [Quick Start — Docker Compose only](#quick-start--docker-compose-only)
4. [Quick Start — Bare-metal / host install](#quick-start--bare-metal--host-install)
5. [Environment Variables](#environment-variables)
6. [Database migrations & seeds](#database-migrations--seeds)
7. [Running services](#running-services)
8. [Health checks](#health-checks)
9. [Blockchain compiler setup (optional)](#blockchain-compiler-setup-optional)
10. [Teardown & data reset](#teardown--data-reset)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Min version | Notes |
|------|-------------|-------|
| Git | any | required |
| Docker Desktop / Docker Engine | 24+ | required for container workflows |
| Docker Compose | v2 (plugin) | ships with Docker Desktop |
| Node.js | 22 | required for bare-metal only |
| npm | 9+ | required for bare-metal only |
| `pg_isready` | any | optional, part of `postgresql-client` |

Blockchain compilers are **optional** and only needed to compile/test smart
contracts:

| Tool | Version | Install |
|------|---------|---------|
| Foundry (`forge`) | pinned in `contracts/solidity_contract/foundry.lock` | `curl -L https://foundry.paradigm.xyz \| bash` |
| Scarb | pinned in `contracts/starknet_contract/Scarb.toml` | `curl --proto '=https' --tlsv1.2 -sSf https://docs.swmansion.com/scarb/install.sh \| sh` |

---

## Quick Start — Dev Container (recommended)

The `.devcontainer/` configuration wires up VS Code (or GitHub Codespaces) to
the full Docker Compose stack automatically.

```bash
# 1. Clone
git clone https://github.com/llinsss/payCrypt_v2.git
cd payCrypt_v2

# 2. Open in VS Code
code .
# → VS Code will prompt "Reopen in Dev Container" — click it.
# → The post-create script runs automatically:
#     - npm install (root + backend)
#     - copies backend/.env.example → backend/.env
#     - waits for Postgres and Redis to be healthy
#     - runs migrations and seeds
```

Ports forwarded automatically:

| Service | URL |
|---------|-----|
| Backend API | http://localhost:3000 |
| Frontend (Vite) | http://localhost:5173 |
| Bull Board UI | http://localhost:3001/admin/running-queues |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

---

## Quick Start — Docker Compose only

```bash
git clone https://github.com/llinsss/payCrypt_v2.git
cd payCrypt_v2

# Copy and customise the env file
cp backend/.env.example backend/.env
# → Edit backend/.env with your desired values (see Environment Variables below)

# Start all services (Postgres, Redis, backend with hot-reload)
docker compose up --build

# In a separate terminal, start the Vite dev server
npm install
npm run dev
```

The `backend` service container waits for both `postgres` and `redis` health
checks before starting, so migrations run in the correct order.

---

## Quick Start — Bare-metal / host install

Requires Node.js 22, a running PostgreSQL 14 instance, and a running Redis 7
instance.

```bash
git clone https://github.com/llinsss/payCrypt_v2.git
cd payCrypt_v2

# Root (frontend) dependencies
npm install

# Backend dependencies
cd backend
npm install

# Configure environment
cp .env.example .env
# → Edit .env — set DB_HOST, DB_USER, DB_PASSWORD, REDIS_URL, JWT_SECRET etc.

# Run migrations and seeds
npm run migrate

# Start backend
npm run dev

# In a new terminal, start the frontend
cd ..
npm run dev
```

---

## Environment Variables

### Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env`.  Defaults that work with the
Docker Compose stack are pre-filled.

| Variable | Default (Docker Compose) | Description |
|----------|--------------------------|-------------|
| `DB_HOST` | `postgres` | PostgreSQL hostname |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `taggedpay` | Database name |
| `DB_USER` | `taggedpay_user` | Database user |
| `DB_PASSWORD` | `taggedpay_password` | Database password |
| `REDIS_HOST` | `redis` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_URL` | `redis://redis:6379` | Full Redis URL |
| `JWT_SECRET` | *(no default)* | **Required.** Min 32 chars. |
| `NODE_ENV` | `development` | Runtime environment |
| `PORT` | `3000` | API listen port |

> **Never commit real secrets.** `backend/.env` is in `.gitignore`.

### Root (Frontend) — `.env`

Copy `.env.example` to `.env` and adjust as needed.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3000` | Backend base URL |

---

## Database migrations & seeds

```bash
# Run all pending migrations AND apply seed data
cd backend
npm run migrate           # knex migrate:latest && knex seed:run

# Run migrations only (no seeds)
npx knex migrate:latest

# Run seeds only
npx knex seed:run

# Check migration status
npm run migrate:status

# Roll back the last batch
npm run migrate:rollback

# Roll back ALL migrations
npm run migrate:rollback:all
```

Seed files live in `backend/seeds/` and load in numeric order:

| File | Contents |
|------|----------|
| `01_tokens_seed.js` | Supported tokens (XLM, USDC, …) |
| `02_chains_seed.js` | Supported chains |
| `03_stellar_example_data.js` | Stellar account / tag examples |
| `04_demo_users_wallets.js` | Demo user accounts and wallets |
| `05_demo_transactions.js` | Sample transaction history |

---

## Running services

```bash
# Backend (hot-reload with nodemon)
cd backend && npm run dev

# Frontend (Vite HMR)
npm run dev           # from repo root

# Backend tests
cd backend && npm test

# Frontend type-check
npm run type-check    # from repo root
```

---

## Health checks

Both `postgres` and `redis` expose health checks in `docker-compose.yml`.
The `backend` service will not start until both return healthy.

To verify manually:

```bash
# Postgres
docker compose exec postgres pg_isready -U taggedpay_user -d taggedpay

# Redis
docker compose exec redis redis-cli ping
# → PONG

# Backend API health endpoint
curl http://localhost:3000/health
```

---

## Blockchain compiler setup (optional)

Smart-contract development is **not** required for web/backend work.

```bash
# Foundry (Solidity — contracts/solidity_contract/)
curl -L https://foundry.paradigm.xyz | bash
foundryup
# Verify:
forge --version

# Scarb (Cairo / Starknet — contracts/starknet_contract/)
curl --proto '=https' --tlsv1.2 -sSf \
  https://docs.swmansion.com/scarb/install.sh | sh
# Verify:
scarb --version
```

Both compilers work fine on the host without being inside the container.

---

## Teardown & data reset

### Stop all containers (keep data volumes)

```bash
docker compose down
```

### Stop and remove all data volumes (full wipe)

```bash
docker compose down --volumes
# ⚠ This permanently deletes postgres-data and redis-data.
```

### Reset the database only (keep containers running)

```bash
cd backend
npm run db:reset
# Equivalent to: knex migrate:rollback --all && knex migrate:latest && knex seed:run
```

### Reset just the Redis data

```bash
docker compose exec redis redis-cli FLUSHALL
```

### Full clean slate (containers + volumes + node_modules)

```bash
docker compose down --volumes --remove-orphans
rm -rf node_modules backend/node_modules
git clean -fdx --exclude='.env' --exclude='backend/.env'
# Then follow Quick Start again.
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `getaddrinfo ENOTFOUND postgres` | You are running the backend on the **host** but using Docker Compose container hostnames. Set `DB_HOST=localhost` in `backend/.env`. |
| Port 5432 already in use | Stop your local Postgres: `sudo service postgresql stop` or change `ports: - "5433:5432"` in `docker-compose.yml`. |
| Port 6379 already in use | `sudo service redis-server stop` or remap the Redis port. |
| `JWT_SECRET` must be at least 32 characters | Generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Migrations fail with `relation already exists` | Run `npm run migrate:rollback:all` then `npm run migrate`. |
| Vite can't reach backend | Ensure `VITE_API_URL=http://localhost:3000` in your root `.env` and the backend is running. |
| Dev Container won't build | Confirm Docker is running and you have the "Dev Containers" VS Code extension installed. |
