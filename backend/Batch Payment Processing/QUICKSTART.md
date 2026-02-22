# Quick Start Guide

Get the batch payment API running in minutes.

## Step 1: Start Infrastructure

Start PostgreSQL and Redis using Docker:

```bash
docker-compose up -d
```

Wait for services to be healthy (about 10 seconds).

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Configure Environment

```bash
cp .env.example .env
```

The default values work with the Docker setup.

## Step 4: Initialize Database

The database tables are automatically created when you start the application (TypeORM synchronize is enabled in development).

Alternatively, run the migration manually:

```bash
docker exec -i payment_postgres psql -U postgres -d payment_db < migrations/20240221_create_batch_payments.sql
```

## Step 5: Start the Application

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`.

## Step 6: Test the API

### Create a batch payment:

```bash
curl -X POST http://localhost:3000/api/transactions/batch \
  -H "Content-Type: application/json" \
  -d '{
    "payments": [
      {
        "recipientTag": "@alice",
        "amount": 100,
        "asset": "XLM",
        "memo": "Test payment 1"
      },
      {
        "recipientTag": "@bob",
        "amount": 200,
        "asset": "XLM",
        "memo": "Test payment 2"
      }
    ],
    "failureMode": "continue"
  }'
```

### Check batch status:

```bash
curl http://localhost:3000/api/transactions/batch/1
```

## Testing Different Scenarios

### Test Continue Mode (Partial Success)

Payments continue even if some fail:

```bash
curl -X POST http://localhost:3000/api/transactions/batch \
  -H "Content-Type: application/json" \
  -d @examples/batch-payment-request.json
```

### Test Abort Mode (All or Nothing)

All payments rolled back if any fails:

```bash
curl -X POST http://localhost:3000/api/transactions/batch \
  -H "Content-Type: application/json" \
  -d '{
    "payments": [
      {"recipientTag": "@user1", "amount": 100, "asset": "XLM"},
      {"recipientTag": "@user2", "amount": 200, "asset": "XLM"}
    ],
    "failureMode": "abort"
  }'
```

## Run Tests

```bash
npm test
```

## Stop Infrastructure

```bash
docker-compose down
```

To remove all data:

```bash
docker-compose down -v
```

## Troubleshooting

### Port Already in Use

If ports 5432 or 6379 are already in use, modify `docker-compose.yml` to use different ports.

### Database Connection Failed

Ensure PostgreSQL is running:

```bash
docker-compose ps
```

### Redis Connection Failed

Ensure Redis is running:

```bash
docker exec payment_redis redis-cli ping
```

Should return `PONG`.

## Next Steps

- Review the API documentation in `README.md`
- Explore example requests in `examples/`
- Check the test suite in `src/**/*.spec.ts`
- Customize the payment processing logic in `src/services/payment.service.ts`
