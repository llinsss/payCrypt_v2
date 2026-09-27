#!/bin/sh
# Docker entrypoint script for production deployments
#
# MIGRATION & SEED STRATEGY:
# - This script enables optional migrations and seeding at container startup
# - By default, the container runs the application (npm start)
# - Set MIGRATE_ON_START=true or MIGRATE_ON_START=prod to run migrations
# - Set SEED_ON_START=prod to load production-safe seeds
# - Set SEED_ON_START=demo to load all seeds (development/staging only)
#
# USAGE:
# Production (migrations only):
#   docker run -e MIGRATE_ON_START=prod <image>
#
# Production (migrations + production-safe seeds):
#   docker run -e MIGRATE_ON_START=prod -e SEED_ON_START=prod <image>
#
# Development/Staging (migrations + all seeds):
#   docker run -e MIGRATE_ON_START=true -e SEED_ON_START=demo <image>
#
# See: backend/docs/SEED_CATEGORIZATION.md for seed categorization

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "${GREEN}=== PayCrypt Backend Docker Entrypoint ===${NC}"

# Step 1: Run migrations if requested
if [ "$MIGRATE_ON_START" = "true" ] || [ "$MIGRATE_ON_START" = "prod" ]; then
    echo "${YELLOW}→ Running database migrations...${NC}"
    npm run migrate
    if [ $? -eq 0 ]; then
        echo "${GREEN}✓ Migrations completed successfully${NC}"
    else
        echo "${RED}✗ Migrations failed${NC}"
        exit 1
    fi
else
    echo "${YELLOW}→ Skipping migrations (set MIGRATE_ON_START=true to enable)${NC}"
fi

# Step 2: Seed database if requested
if [ -n "$SEED_ON_START" ]; then
    case "$SEED_ON_START" in
        prod)
            echo "${YELLOW}→ Loading production-safe seeds...${NC}"
            npm run seed:prod
            if [ $? -eq 0 ]; then
                echo "${GREEN}✓ Production seeds loaded successfully${NC}"
            else
                echo "${RED}✗ Production seeding failed${NC}"
                exit 1
            fi
            ;;
        demo)
            echo "${YELLOW}→ Loading all seeds including demo data...${NC}"
            echo "${RED}⚠ WARNING: Demo data is being loaded. Use only in development/staging.${NC}"
            npm run seed:demo
            if [ $? -eq 0 ]; then
                echo "${GREEN}✓ All seeds loaded successfully${NC}"
            else
                echo "${RED}✗ Seeding failed${NC}"
                exit 1
            fi
            ;;
        *)
            echo "${RED}✗ Invalid SEED_ON_START value: $SEED_ON_START (must be 'prod' or 'demo')${NC}"
            exit 1
            ;;
    esac
else
    echo "${YELLOW}→ Skipping seeding (set SEED_ON_START to enable)${NC}"
fi

# Step 3: Start the application
echo "${GREEN}→ Starting PayCrypt backend...${NC}"
exec "$@"
