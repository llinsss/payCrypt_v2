#!/usr/bin/env bash
# backend/scripts/wait-for-services.sh
#
# Blocks until PostgreSQL and Redis are ready.
# Usage: bash scripts/wait-for-services.sh
#
# Reads connection details from environment variables (same as backend/.env).
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-taggedpay_user}"
DB_NAME="${DB_NAME:-taggedpay}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-30}"
SLEEP_INTERVAL="${SLEEP_INTERVAL:-2}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

wait_for() {
  local name="$1"
  local check_cmd="$2"
  local attempt=0

  echo -n "Waiting for $name"
  until eval "$check_cmd" &>/dev/null; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
      echo ""
      echo -e "${RED}ERROR:${NC} $name did not become ready after $((MAX_ATTEMPTS * SLEEP_INTERVAL))s."
      exit 1
    fi
    echo -n "."
    sleep "$SLEEP_INTERVAL"
  done
  echo -e " ${GREEN}ready${NC}"
}

wait_for "PostgreSQL" \
  "pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"

wait_for "Redis" \
  "redis-cli -h $REDIS_HOST -p $REDIS_PORT ping | grep -q PONG"

echo -e "${GREEN}All services are ready.${NC}"
