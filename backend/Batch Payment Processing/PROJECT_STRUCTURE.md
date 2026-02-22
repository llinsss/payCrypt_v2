# Project Structure

```
batch-payment-api/
├── src/
│   ├── controllers/
│   │   ├── batch-payment.controller.ts          # HTTP endpoints for batch payments
│   │   └── batch-payment.controller.spec.ts     # Controller tests
│   │
│   ├── services/
│   │   ├── batch-payment.service.ts             # Core batch payment logic
│   │   ├── batch-payment.service.spec.ts        # Service tests
│   │   └── payment.service.ts                   # Individual payment processing
│   │
│   ├── processors/
│   │   └── batch-payment.processor.ts           # BullMQ job processor
│   │
│   ├── entities/
│   │   ├── batch-payment.entity.ts              # BatchPayment database model
│   │   └── payment.entity.ts                    # Payment database model
│   │
│   ├── dto/
│   │   └── batch-payment.dto.ts                 # Request/response DTOs
│   │
│   ├── batch-payment.module.ts                  # Feature module
│   ├── app.module.ts                            # Root application module
│   └── main.ts                                  # Application entry point
│
├── migrations/
│   └── 20240221_create_batch_payments.sql       # Database schema
│
├── examples/
│   ├── batch-payment-request.json               # Sample request
│   └── test-requests.http                       # HTTP test requests
│
├── package.json                                 # Dependencies
├── tsconfig.json                                # TypeScript config
├── nest-cli.json                                # NestJS CLI config
├── jest.config.js                               # Jest test config
├── docker-compose.yml                           # Docker services
├── .env.example                                 # Environment template
├── .gitignore                                   # Git ignore rules
├── README.md                                    # Main documentation
├── QUICKSTART.md                                # Quick start guide
└── PROJECT_STRUCTURE.md                         # This file
```

## Key Components

### Controllers

- **BatchPaymentController**: Handles HTTP requests for creating and querying batch payments

### Services

- **BatchPaymentService**: Orchestrates batch payment processing, manages concurrency, handles failure modes
- **PaymentService**: Processes individual payments, validates balances, submits to blockchain

### Processors

- **BatchPaymentProcessor**: Background job processor using BullMQ for async batch processing

### Entities

- **BatchPayment**: Tracks batch payment metadata and results
- **Payment**: Individual payment records

### DTOs

- **CreateBatchPaymentDto**: Request validation for batch creation
- **PaymentRequestDto**: Individual payment validation
- **BatchPaymentResponseDto**: Standardized response format

## Data Flow

1. Client → POST /api/transactions/batch
2. Controller validates request
3. Service creates batch record
4. Job queued to BullMQ
5. Processor handles background processing
6. Payments processed in parallel (5 concurrent)
7. Results stored in batch record
8. Client polls GET /api/transactions/batch/:id

## Testing Strategy

- Unit tests for services (batch-payment.service.spec.ts)
- Controller tests (batch-payment.controller.spec.ts)
- Integration tests can be added in e2e/ directory

## Configuration

- Environment variables in .env
- Database connection via TypeORM
- Redis connection via BullMQ
- Rate limiting via @nestjs/throttler

## Deployment

1. Set up PostgreSQL and Redis
2. Configure environment variables
3. Run migrations
4. Build and start application
5. Monitor queue processing

## Scalability Considerations

- Horizontal scaling: Multiple app instances share Redis queue
- Database indexing on user_id and status
- Concurrency limit prevents overload
- Background processing prevents request timeouts
