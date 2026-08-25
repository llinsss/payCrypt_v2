# Contributing to Tagged

Thank you for your interest in contributing to Tagged! This document provides guidelines for contributing to the project.

## Development Setup

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL >= 14
- Redis >= 6

### Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/llinsss/payCrypt_v2.git
   cd payCrypt_v2
   ```

2. **Install dependencies**
   ```bash
   # Frontend
   npm install
   
   # Backend
   cd backend
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Frontend
   cp .env.example .env
   
   # Backend
   cd backend
   cp .env.example .env
   ```

4. **Set up database**
   ```bash
   cd backend
   npm run migrate
   ```

5. **Start development servers**
   ```bash
   # Terminal 1: Frontend
   npm run dev
   
   # Terminal 2: Backend
   cd backend
   npm run dev
   ```

### Quick Start with Docker

Prefer not to install PostgreSQL/Redis locally? The full backend stack —
Postgres, Redis, and the backend API with hot reload — runs with a single
command:

```bash
cp backend/.env.example backend/.env
docker-compose up
```

This will:
- Start PostgreSQL 14 and Redis 7 with health checks
- Build and start the backend with `nodemon`, bind-mounted so file changes
  reload automatically — no rebuild needed
- Run pending database migrations automatically on backend startup
- Expose the API at `http://localhost:3000`
- Expose Bull Board (queue admin UI) at
  `http://localhost:3001/admin/running-queues` (basic auth: `BULL_ADMIN_USER`
  / `BULL_ADMIN_PASS` from `backend/.env`)

To stop everything: `docker-compose down` (add `-v` to also drop the
Postgres/Redis volumes and start from a clean database).

## Code Standards

### JavaScript/TypeScript
- Use ES6+ features
- Follow ESLint configuration
- Use meaningful variable names
- Add comments for complex logic
- Keep functions small and focused

### Commits
- Use conventional commit messages:
  - `feat:` New features
  - `fix:` Bug fixes
  - `docs:` Documentation changes
  - `style:` Code style changes
  - `refactor:` Code refactoring
  - `test:` Test additions/changes
  - `chore:` Build/tooling changes

### Pull Requests
1. Create a feature branch from `master`
2. Make your changes
3. Write/update tests
4. Ensure all tests pass
5. Update documentation
6. Submit PR with clear description

### Safe Knex Query Patterns

Knex parameterises the query builder for you, so ordinary calls are already safe:

```js
db("transactions").where("user_id", userId);          // safe — bound automatically
```

The `raw` family is different: it takes SQL as text. Interpolating a value into
that text reintroduces SQL injection regardless of how safe the rest of the
query is.

```js
// Never do this — userId is concatenated straight into the SQL.
db.raw(`SELECT * FROM transactions WHERE user_id = ${userId}`);

// Do this — the value is bound, and the driver escapes it.
db.raw("SELECT * FROM transactions WHERE user_id = ?", [userId]);
```

The same applies to every text-taking method: `whereRaw`, `orWhereRaw`,
`havingRaw`, `groupByRaw`, `orderByRaw`, `joinRaw`.

```js
// Bindings work in these too.
query.groupByRaw("DATE_TRUNC(?, created_at)", [period]);
```

**Identifiers cannot be bound.** Bindings replace *values*, not table or column
names, so a dynamic column has to be validated instead. Check it against an
allow-list and never pass request input through:

```js
const SORTABLE = { created: "created_at", amount: "usd_value" };
const column = SORTABLE[req.query.sortBy] ?? "created_at";  // allow-list
query.orderByRaw(`${column} DESC`); // check-raw-sql-allow: column is allow-listed above
```

A template literal with no `${}` in it is just a string and is perfectly fine —
multi-line SQL is often clearer that way.

#### Automated check

`backend/scripts/check-raw-sql.js` fails on interpolated raw SQL. Run it any
time:

```bash
cd backend && npm run check:raw-sql
```

To have it run before every commit, enable the committed hooks once per clone:

```bash
git config core.hooksPath .githooks
```

Migrations, seeds and one-off scripts are excluded — they build DDL from trusted
local input, never from request data. If you have a genuinely safe interpolation
that the check flags, add a `check-raw-sql-allow` comment on that line stating
why it is safe.

## Continuous Integration

Every pull request is gated on a single required status check:

```
ci/required-checks
```

This check runs unconditionally on every PR and aggregates four component
pipelines. You only ever need to watch this one name in the branch-protection
UI.

### Component checks

| Check name | Triggered by | What runs |
|---|---|---|
| `ci/web` | `src/**`, shared config | lint, typecheck, vite build |
| `ci/backend` | `backend/**` | lint, npm audit (high+critical), jest |
| `ci/sdk` | `packages/**`, shared config | lint, typecheck, tsup build |
| `ci/contracts` | `contracts/**` | solhint, forge build+test, slither, snforge |

> **Shared-config fan-out** — `tsconfig*.json` and `eslint.config.js` are
> shared between the web frontend and both SDK packages, so changing them
> triggers `ci/web` **and** `ci/sdk`.

### Security gates

- `ci/backend` — `npm audit --audit-level=high` fails the PR on HIGH or CRITICAL
  CVEs in backend dependencies.
- `ci/contracts` — Slither static analysis runs with `--fail-high`; any HIGH or
  CRITICAL finding blocks the merge.

### Workflow files

```
.github/workflows/
├── web-ci.yml          ← Web lint · typecheck · build
├── backend-ci.yml      ← Backend lint · audit · test
├── sdk-ci.yml          ← SDK lint · typecheck · build (matrix)
├── contracts-ci.yml    ← Contracts solhint · forge · slither · snforge
├── required-checks.yml ← Gate — exposes ci/required-checks
├── flutter-ci.yml      ← Mobile (Flutter) — separate, not part of gate
└── docker-build.yml    ← Docker image push (push to master only)
```

See **[docs/ci.md](docs/ci.md)** for the full reference: path-trigger tables,
per-step detail, tool versions, local equivalents, and artifact retention.

### Running CI checks locally

```bash
# Web
npm ci && npm run lint && npm run type-check && npm run build

# Backend
cd backend && npm ci && npm run lint && npm audit --audit-level=high && npm test

# SDK (@tagged/sdk)
cd packages/sdk && npm ci && npm run lint && npm run typecheck && npm run build

# SDK (@tagged/stellar-sdk)
cd packages/stellar-sdk && npm ci && npm run lint && npm run typecheck && npm run build

# Contracts — Solidity
cd contracts/solidity_contract
solhint 'src/**/*.sol' && forge build && forge test -vvv
slither . --exclude-dependencies --filter-paths "lib/" --fail-high

# Contracts — StarkNet
cd contracts/starknet_contract && scarb build && snforge test
```

## Project Structure

```
payCrypt_v2/
├── backend/          # Node.js/Express API
├── src/              # React frontend
├── contracts/        # Smart contracts
├── packages/         # Shared packages
└── docs/             # Documentation
```

## Testing

```bash
# Frontend
npm run test

# Backend
cd backend
npm run test
```

## Questions?

- Open an issue for bugs
- Start a discussion for questions
- Check existing documentation

## License

By contributing, you agree that your contributions will be licensed under the project's license.
