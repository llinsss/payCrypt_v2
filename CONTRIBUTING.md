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
