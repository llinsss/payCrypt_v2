# Batch Payment API - NestJS Implementation

A robust batch payment processing system built with NestJS that allows users to process multiple payments in a single request with parallel processing, configurable concurrency limits, and partial success handling.

## Features

- Process up to 50 payments per batch
- Parallel processing with concurrency limit (5 concurrent payments)
- Two failure modes: "abort" (rollback all) or "continue" (partial success)
- Background job processing with BullMQ
- Rate limiting: 10 batches per hour per user
- Individual payment validation and tracking
- Batch status monitoring
- Upfront fee calculation

## Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis 6+

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Update the environment variables as needed.

## Database Setup

Run the migration to create tables:

```bash
psql -U postgres -d payment_db -f migrations/20240221_create_batch_payments.sql
```

## Running the Application

Development mode:

```bash
npm run start:dev
```

Production mode:

```bash
npm run build
npm run start:prod
```

## API Endpoints

### Create Batch Payment

**POST** `/api/transactions/batch`

Create a new batch payment request.

**Request Body:**

```json
{
  "payments": [
    {
      "recipientTag": "@user1",
      "amount": 100,
      "asset": "XLM",
      "memo": "Payment 1"
    },
    {
      "recipientTag": "@user2",
      "amount": 200,
      "asset": "XLM",
      "memo": "Payment 2"
    }
  ],
  "failureMode": "continue"
}
```

**Response:**

```json
{
  "batchId": 123,
  "status": "pending",
  "totalPayments": 2,
  "successfulPayments": 0,
  "failedPayments": 0,
  "totalAmount": "300",
  "totalFees": "0.2",
  "results": [],
  "createdAt": "2024-02-21T10:00:00.000Z"
}
```

### Get Batch Status

**GET** `/api/transactions/batch/:id`

Retrieve the status of a batch payment.

**Response:**

```json
{
  "batchId": 123,
  "status": "completed",
  "totalPayments": 2,
  "successfulPayments": 2,
  "failedPayments": 0,
  "totalAmount": "300",
  "totalFees": "0.2",
  "results": [
    {
      "index": 0,
      "status": "success",
      "transactionId": 456
    },
    {
      "index": 1,
      "status": "success",
      "transactionId": 457
    }
  ],
  "createdAt": "2024-02-21T10:00:00.000Z",
  "completedAt": "2024-02-21T10:00:05.000Z"
}
```

## Failure Modes

### Continue Mode

- Processes all payments independently
- Returns partial success results
- Failed payments don't affect successful ones

### Abort Mode

- Stops processing on first failure
- Rolls back all successful payments
- Returns all payments as failed

## Validation Rules

- Maximum 50 payments per batch
- Minimum amount: 0.0000001
- Recipient tag must start with '@'
- Rate limit: 10 batches per hour per user

## Testing

Run tests:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:cov
```

## Architecture

### Components

- **BatchPaymentController**: Handles HTTP requests
- **BatchPaymentService**: Core business logic
- **PaymentService**: Individual payment processing
- **BatchPaymentProcessor**: Background job processor
- **Entities**: TypeORM entities for database models

### Processing Flow

1. Client submits batch payment request
2. System validates and creates batch record
3. Job queued to BullMQ for background processing
4. Payments processed in parallel (5 concurrent)
5. Results tracked and batch status updated
6. Client polls for status updates

## Performance Metrics

- Batch processing time: < 10s for 50 payments
- Success rate: > 95%
- Concurrency limit: 5 concurrent payments
- API call reduction: 95% for bulk operations

## Business Value

- Enable payroll and bulk payment use cases
- Reduce API calls significantly
- Attract business customers
- Improve operational efficiency

## License

MIT
