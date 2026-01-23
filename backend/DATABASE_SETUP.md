# Database Setup Guide - Stellar SDK

This guide covers the PostgreSQL database setup for the Stellar SDK integration.

## Prerequisites

- PostgreSQL 12+ installed and running
- Node.js 16+ installed
- Access to PostgreSQL with CREATE DATABASE privileges

## Quick Start

### 1. Install PostgreSQL

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**macOS (Homebrew):**
```bash
brew install postgresql@14
brew services start postgresql@14
```

**Windows:**
Download and install from [postgresql.org](https://www.postgresql.org/download/windows/)

### 2. Create Database

```bash
# Login to PostgreSQL
sudo -u postgres psql

# Create database and user
CREATE DATABASE taggedpay;
CREATE USER taggedpay_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE taggedpay TO taggedpay_user;

# Exit psql
\q
```

### 3. Configure Environment

Copy the example environment file and update with your database credentials:

```bash
cp .env.example .env
```

Edit `.env` and set:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=taggedpay
DB_USER=taggedpay_user
DB_PASSWORD=your_secure_password
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run Migrations

```bash
# Run all pending migrations
npm run migrate

# Check migration status
npm run migrate:status
```

### 6. Seed Database (Optional)

```bash
npm run seed
```

## Database Schema

The Stellar SDK uses the following tables:

### Core Tables

1. **stellar_tags** - Maps @tags to Stellar addresses
2. **stellar_accounts** - Stores account information and balances
3. **stellar_transactions** - Transaction history
4. **webhooks** - Webhook configurations
5. **webhook_events** - Webhook delivery tracking

See `docs/stellar-database-schema.md` for detailed schema documentation.

## Migration Commands

```bash
# Apply all pending migrations
npm run migrate

# Create a new migration
npm run migrate:make migration_name

# Rollback last migration
npm run migrate:rollback

# Rollback all migrations
npm run migrate:rollback:all

# Check migration status
npm run migrate:status

# Reset database (rollback all, migrate, seed)
npm run db:reset
```

## Connection Pooling

The database uses connection pooling configured in `knexfile.js`:

- **Minimum connections:** 2
- **Maximum connections:** 10

Adjust these values based on your application load:

```javascript
pool: {
  min: 2,
  max: 10,
  acquireTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
}
```

## Performance Optimization

### Indexes

All tables include optimized indexes for common query patterns:

- Single column indexes on frequently queried fields
- Composite indexes for multi-column queries
- JSONB indexes for JSON field queries

### Query Optimization Tips

1. Use the provided model methods for common operations
2. Leverage composite indexes for date range queries
3. Use pagination (limit/offset) for large result sets
4. Monitor slow queries with PostgreSQL's `pg_stat_statements`

### Enable Query Logging (Development)

Add to `knexfile.js`:

```javascript
debug: process.env.NODE_ENV === 'development',
```

## Backup and Restore

### Backup Database

```bash
pg_dump -U taggedpay_user -d taggedpay > backup.sql
```

### Restore Database

```bash
psql -U taggedpay_user -d taggedpay < backup.sql
```

### Automated Backups

Set up a cron job for daily backups:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * pg_dump -U taggedpay_user -d taggedpay > /backups/taggedpay_$(date +\%Y\%m\%d).sql
```

## Monitoring

### Check Database Health

```javascript
import { checkDatabaseConnection } from './utils/dbHealth.js';

const health = await checkDatabaseConnection();
console.log(health);
```

### Monitor Connection Pool

```javascript
import { getConnectionPoolStats } from './utils/dbHealth.js';

const stats = getConnectionPoolStats();
console.log(stats);
```

### Check Active Connections

```sql
SELECT count(*) FROM pg_stat_activity WHERE datname = 'taggedpay';
```

## Troubleshooting

### Connection Refused

**Problem:** `ECONNREFUSED` error when connecting to database

**Solutions:**
1. Ensure PostgreSQL is running: `sudo systemctl status postgresql`
2. Check `pg_hba.conf` for connection permissions
3. Verify host and port in `.env` file

### Too Many Connections

**Problem:** `too many connections` error

**Solutions:**
1. Increase `max_connections` in `postgresql.conf`
2. Reduce connection pool size in `knexfile.js`
3. Check for connection leaks in application code

### Migration Errors

**Problem:** Migration fails with constraint errors

**Solutions:**
1. Check migration order (dependencies)
2. Rollback and re-run: `npm run migrate:rollback && npm run migrate`
3. Check for existing data conflicts

### Slow Queries

**Problem:** Database queries are slow

**Solutions:**
1. Enable query logging to identify slow queries
2. Add missing indexes
3. Use `EXPLAIN ANALYZE` to understand query plans
4. Consider table partitioning for large tables

## Security Best Practices

1. **Use strong passwords** for database users
2. **Limit database user privileges** to only required operations
3. **Enable SSL/TLS** for production database connections
4. **Regular backups** with encryption
5. **Monitor for suspicious activity** using PostgreSQL logs
6. **Keep PostgreSQL updated** with security patches

## Production Considerations

### SSL/TLS Connection

Update `knexfile.js` for production:

```javascript
connection: {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
}
```

### Read Replicas

For high-traffic applications, consider read replicas:

```javascript
connection: {
  master: { /* primary connection */ },
  slaves: [
    { /* read replica 1 */ },
    { /* read replica 2 */ },
  ]
}
```

### Connection Pooling

Adjust pool size based on server resources:

```javascript
pool: {
  min: 5,
  max: 20,
  acquireTimeoutMillis: 60000,
  idleTimeoutMillis: 600000,
}
```

## Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Knex.js Documentation](https://knexjs.org/)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Database Indexing Best Practices](https://use-the-index-luke.com/)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review PostgreSQL logs: `/var/log/postgresql/`
3. Check application logs for detailed error messages
4. Consult the team documentation or support channels
