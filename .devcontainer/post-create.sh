#!/usr/bin/env bash
# .devcontainer/post-create.sh
# Runs once after the dev container is created.
# Sets up both the backend and frontend for local development.
set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${CYAN}[devcontainer]${NC} $*"; }
ok()  { echo -e "${GREEN}[devcontainer]${NC} ✓ $*"; }
warn(){ echo -e "${YELLOW}[devcontainer]${NC} ⚠ $*"; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── 1. Root (frontend) dependencies ─────────────────────────────────────────
log "Installing root (frontend) dependencies..."
cd "$REPO_ROOT"
npm install
ok "Frontend deps installed"

# ── 2. Backend dependencies ──────────────────────────────────────────────────
log "Installing backend dependencies..."
cd "$REPO_ROOT/backend"
npm install
ok "Backend deps installed"

# ── 3. Copy backend .env if missing ─────────────────────────────────────────
cd "$REPO_ROOT"
if [ ! -f backend/.env ]; then
  log "Copying backend/.env.example → backend/.env"
  cp backend/.env.example backend/.env
  warn "backend/.env created from example — review and add real secrets before use."
else
  ok "backend/.env already exists, skipping."
fi

# ── 4. Wait for PostgreSQL ───────────────────────────────────────────────────
log "Waiting for PostgreSQL to be ready..."
until pg_isready -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "${DB_USER:-taggedpay_user}" -d "${DB_NAME:-taggedpay}" 2>/dev/null; do
  echo -n "."
  sleep 2
done
echo ""
ok "PostgreSQL is ready"

# ── 5. Wait for Redis ────────────────────────────────────────────────────────
log "Waiting for Redis to be ready..."
until redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" ping 2>/dev/null | grep -q PONG; do
  echo -n "."
  sleep 2
done
echo ""
ok "Redis is ready"

# ── 6. Run migrations + seeds ────────────────────────────────────────────────
log "Running database migrations..."
cd "$REPO_ROOT/backend"
npm run migrate
ok "Migrations and seeds applied"

# ── 7. Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Tagged dev environment is ready!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Start backend:   cd backend && npm run dev"
echo "  Start frontend:  npm run dev          (from repo root)"
echo ""
echo "  Backend API  → http://localhost:3000"
echo "  Vite dev     → http://localhost:5173"
echo "  Bull Board   → http://localhost:3001/admin/running-queues"
echo ""
echo "  See docs/LOCAL_DEVELOPMENT.md for full details."
echo ""
