# NestJS API Versioning

A production-ready NestJS implementation of API versioning with backward compatibility support.

## Features

- ✅ URL-based versioning (`/api/v1/`, `/api/v2/`)
- ✅ Automatic deprecation headers for v1
- ✅ Sunset date tracking (6 months)
- ✅ Migration guides and documentation
- ✅ Separate controllers for each version
- ✅ Comprehensive test coverage
- ✅ Type-safe implementation

## Quick Start

### Installation

```bash
npm install
```

### Running the Application

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start
```

### Testing

```bash
npm test
```

## API Endpoints

### V1 (Deprecated)

```bash
GET /api/v1/users          # List all users
GET /api/v1/users/:id      # Get user by ID
```

### V2 (Current)

```bash
GET  /api/v2/users         # List all users
GET  /api/v2/users/:id     # Get user by ID
POST /api/v2/users         # Create new user
```

## Example Requests

### V1 Request

```bash
curl http://localhost:3000/api/v1/users
```

**Response:**

```json
{
  "data": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john.doe@example.com"
    }
  ],
  "meta": {
    "version": "v1",
    "deprecated": true,
    "message": "This version is deprecated. Please migrate to v2."
  }
}
```

**Headers:**

```
X-API-Deprecation: true
X-API-Deprecated-Version: v1
X-API-Sunset: 2024-08-21
X-API-Current-Version: v2
```

### V2 Request

```bash
curl http://localhost:3000/api/v2/users
```

**Response:**

```json
{
  "data": [
    {
      "id": 1,
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "meta": {
    "version": "v2",
    "timestamp": "2024-02-22T10:00:00Z"
  }
}
```

## Project Structure

```
src/
├── main.ts                          # Application entry point
├── app.module.ts                    # Root module
├── interceptors/
│   └── deprecation.interceptor.ts   # Adds deprecation headers
└── modules/
    └── users/
        ├── users.module.ts
        ├── users.service.ts
        ├── users.controller.spec.ts
        └── controllers/
            ├── users-v1.controller.ts
            └── users-v2.controller.ts

docs/
├── API_VERSIONING.md               # Versioning documentation
└── API_MIGRATION_V1_TO_V2.md       # Migration guide
```

## Documentation

- [API Versioning Guide](docs/API_VERSIONING.md)
- [Migration Guide V1 to V2](docs/API_MIGRATION_V1_TO_V2.md)

## Key Implementation Details

### Version Detection

NestJS built-in versioning automatically detects version from URL:

```typescript
app.enableVersioning({
  type: VersioningType.URI,
  prefix: "api/v",
});
```

### Deprecation Headers

The `DeprecationInterceptor` automatically adds headers to v1 responses:

```typescript
@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    // Adds X-API-Deprecation, X-API-Sunset headers
  }
}
```

### Version-Specific Controllers

Each version has its own controller:

```typescript
@Controller("users")
export class UsersV1Controller {
  @Get()
  @Version("1")
  findAll() {
    /* v1 logic */
  }
}

@Controller("users")
export class UsersV2Controller {
  @Get()
  @Version("2")
  findAll() {
    /* v2 logic */
  }
}
```

## Migration Timeline

| Phase            | Timeline   | Status         |
| ---------------- | ---------- | -------------- |
| V2 Launch        | Day 0      | ✅ Complete    |
| Migration Period | Months 1-5 | 🔄 In Progress |
| V1 Sunset        | Month 6    | ⏳ Pending     |

## Testing

Tests cover both versions:

```bash
npm test
```

Test coverage includes:

- V1 response format validation
- V2 response format validation
- Deprecation message verification
- CRUD operations for both versions

## Support

For questions or issues:

- See [Migration Guide](docs/API_MIGRATION_V1_TO_V2.md)
- Email: api-support@example.com

## License

MIT
