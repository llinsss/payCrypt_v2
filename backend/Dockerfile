FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Copy entrypoint script for flexible deployment
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3000

# Default to application startup
# Set MIGRATE_ON_START=true or MIGRATE_ON_START=prod to run migrations at startup
# Set SEED_ON_START=prod to load production-safe seeds
# Set SEED_ON_START=demo to load all seeds (dev/staging only)
# See: backend/docs/SEED_CATEGORIZATION.md
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
