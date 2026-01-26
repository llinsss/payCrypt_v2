# API Security Implementation Guide

## Overview
This document outlines the security measures implemented for the PayCrypt API, including rate limiting, authentication, request validation, CORS configuration, and security headers.

## Features Implemented

### 1. Rate Limiting

#### Global Rate Limiter
- **Limit**: 15 requests per minute per IP
- **Applied To**: All `/api` routes
- **Exemptions**: Health check endpoints
- **Location**: `config/rateLimiting.js`

#### Account Creation Rate Limiter
- **Limit**: 5 new accounts per hour per IP
- **Applied To**: `POST /api/auth/register`
- **Purpose**: Prevent abuse and spam account creation
- **Key Generator**: Client IP address

#### Login Rate Limiter
- **Limit**: 10 failed attempts per 15 minutes
- **Applied To**: `POST /api/auth/login`
- **Purpose**: Prevent brute force attacks
- **Key Generator**: Email or IP address
- **Skip Successful**: Only counts failed attempts

#### Payment Rate Limiter
- **Limit**: 100 transactions per hour per API key/user
- **Applied To**: 
  - `POST /api/transactions` (create)
  - `PUT /api/transactions/:id` (update)
  - `DELETE /api/transactions/:id` (delete)
- **Purpose**: Prevent payment flooding
- **Key Generator**: API key (header) → User ID → IP address

#### Balance Query Rate Limiter
- **Limit**: 1000 queries per hour per API key/user
- **Applied To**:
  - `GET /api/balances/all`
  - `GET /api/balances`
  - `GET /api/balances/:id`
  - `GET /api/balances/tag/:tag`
- **Purpose**: Prevent excessive data queries
- **Key Generator**: API key (header) → User ID → IP address

#### Strict Rate Limiter (Sensitive Operations)
- **Limit**: 5 requests per hour per API key/user
- **Applied To**:
  - `POST /api/api-keys` (create)
  - `POST /api/api-keys/:keyId/rotate` (rotate)
- **Purpose**: Protect sensitive API key operations
- **Key Generator**: API key (header) → User ID → IP address

### 2. Authentication

#### JWT Authentication (Bearer Token)
```
Header: Authorization: Bearer <jwt_token>
```
- Standard token-based authentication for user sessions
- Applied to all protected routes using `authenticate` middleware
- Token verification via `middleware/auth.js`

#### API Key Authentication
```
Header: x-api-key: <api_key>
```
- Long-lived API keys for programmatic access
- API keys stored in `api_keys` table
- Features:
  - Scopes/permissions management
  - IP whitelist support
  - Expiration dates
  - Usage tracking
- Applied via `authenticateApiKey` middleware

#### API Key Features
- **Scopes**: `read`, `write`, `payments`, etc.
- **IP Whitelist**: Optional list of allowed IPs
- **Expiration**: Optional expiration dates
- **Usage Tracking**: Last used timestamp
- **Key Rotation**: Safely rotate keys without downtime
- **Revocation**: Immediately disable compromised keys

### 3. Request Validation & Sanitization

#### Input Validation
- All request inputs validated against Joi schemas
- Validation applied to:
  - Request body (`validate` middleware)
  - Query parameters (`validateQuery` middleware)
  - URL parameters (`validateParams` middleware)
- Unknown fields stripped automatically
- Field-level error messages

#### Input Sanitization
- XSS prevention via HTML sanitization
- Automatic trimming of strings
- Recursive sanitization of objects and arrays
- Applied to all validated inputs via `sanitizeValue` function
- Additional XSS protection via `xss-clean` middleware

#### Predefined Schemas
- `emailSchema`: Validates email addresses
- `passwordSchema`: Enforces password requirements
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character (@$!%*?&)
- `phoneSchema`: Validates phone numbers

### 4. CORS Configuration

```javascript
CORS Options:
- Origins: Configurable via CORS_ORIGIN env variable (comma-separated)
- Credentials: Enabled
- Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
- Allowed Headers: Content-Type, Authorization, x-api-key, x-request-id
- Max Age: 3600 seconds (1 hour)
```

### 5. Security Headers

#### Helmet.js Configuration
- **Content Security Policy (CSP)**
  - Default source: `'self'`
  - Script source: `'self'`
  - Style source: `'self'`, `'unsafe-inline'`

- **HSTS (HTTP Strict Transport Security)**
  - Max age: 1 year (31536000 seconds)
  - Include subdomains: Yes
  - Preload: Yes

- **Frameguard**: Denies framing (prevents clickjacking)
- **XSS Filter**: Enables browser XSS protection
- **X-Content-Type-Options**: nosniff
- **Referrer Policy**: strict-origin-when-cross-origin

#### Additional Security Middleware
- **hpp (HTTP Parameter Pollution)**: Prevents HPP attacks
- **mongoSanitize**: Prevents NoSQL injection
- **express-json**: Limited payload size (10MB max)
- **compression**: GZIP compression enabled

### 6. API Key Management

#### Endpoints
```
POST   /api/api-keys                - Create new API key
GET    /api/api-keys                - List user's API keys
GET    /api/api-keys/:keyId         - Get API key details
PATCH  /api/api-keys/:keyId         - Update API key
POST   /api/api-keys/:keyId/rotate  - Rotate API key
DELETE /api/api-keys/:keyId         - Revoke API key
GET    /api/api-keys/:keyId/stats   - Get usage statistics
```

#### API Key Model Methods
- `generateKey()`: Generate secure random API key
- `create(userId, data)`: Create new API key
- `findByKey(key)`: Find by key value
- `findByUserId(userId)`: List all keys for user
- `update(id, data)`: Update key settings
- `delete(id)`: Soft delete
- `hardDelete(id)`: Permanent delete
- `revoke(id)`: Disable key
- `rotate(id)`: Create new, revoke old
- `hasScope(key, scope)`: Check scope permission
- `isIpWhitelisted(key, ip)`: Verify IP whitelist
- `isExpired(id)`: Check expiration
- `getUsageStats(id)`: Get usage statistics

### 7. Error Handling

#### Rate Limiting Error Response
```json
{
  "error": "Too many requests from this IP, please try again later",
  "retryAfter": 60
}
```

#### Validation Error Response
```json
{
  "error": "Field-specific error message",
  "field": "fieldName"
}
```

#### Authentication Error Response
```json
{
  "error": "Invalid or inactive API key"
}
```

## Implementation Details

### Files Created/Modified

#### New Files
- `config/rateLimiting.js` - Rate limiting configuration
- `middleware/apiKeyAuth.js` - API key authentication middleware
- `migrations/20260123000000_create_api_keys_table.js` - Database migration
- `models/ApiKey.js` - API key data model
- `controllers/apiKeyController.js` - API key management controller
- `routes/apiKeys.js` - API key routes

#### Modified Files
- `app.js` - Added security middleware and improved configuration
- `middleware/validation.js` - Enhanced with sanitization
- `routes/auth.js` - Added rate limiters
- `routes/transactions.js` - Added payment rate limiter
- `routes/balances.js` - Added balance query rate limiter
- `routes/index.js` - Added API keys route

## Environment Variables

Add these to your `.env` file:

```env
# CORS Configuration
CORS_ORIGIN=http://localhost:5173,https://yourdomain.com

# Redis Configuration (for rate limiting)
REDIS_HOST=localhost
REDIS_PORT=6379

# Admin Password
BULL_ADMIN_PASS=your_secure_password

# Node Environment
NODE_ENV=production
```

## Usage Examples

### Using JWT Authentication
```bash
curl -H "Authorization: Bearer eyJhbGc..." \
     http://localhost:3000/api/users/profile
```

### Using API Key Authentication
```bash
curl -H "x-api-key: 8f42a0d1c..." \
     http://localhost:3000/api/balances
```

### Creating an API Key
```bash
curl -X POST \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production API Key",
    "scopes": "read,write,payments",
    "ipWhitelist": "192.168.1.1,192.168.1.2",
    "expiresIn": 365
  }' \
  http://localhost:3000/api/api-keys
```

### Rotating an API Key
```bash
curl -X POST \
  -H "Authorization: Bearer eyJhbGc..." \
  http://localhost:3000/api/api-keys/1/rotate
```

## Database Migration

Run the migration to create the `api_keys` table:

```bash
npm run migrate
```

This creates a table with the following schema:
- `id` (increments, primary key)
- `user_id` (UUID, foreign key)
- `key` (string, unique, indexed)
- `name` (string)
- `scopes` (string, comma-separated)
- `ip_whitelist` (string, comma-separated)
- `is_active` (boolean)
- `created_at` (timestamp)
- `last_used_at` (timestamp)
- `expires_at` (timestamp)
- `deleted_at` (timestamp)

## Best Practices

### For API Consumers
1. **Always store API keys securely** - Use environment variables, not hardcoded
2. **Use IP whitelisting** - Restrict API keys to specific IPs
3. **Set expiration dates** - Rotate keys periodically
4. **Use specific scopes** - Only grant necessary permissions
5. **Monitor usage** - Check last used timestamps
6. **Rotate compromised keys** - Use the rotate endpoint

### For the Backend
1. **Never log API keys** - Only log key IDs for auditing
2. **Use HTTPS only** - Never transmit over HTTP
3. **Validate headers** - Check rate limit headers in responses
4. **Monitor rate limits** - Alert on suspicious patterns
5. **Update headers regularly** - Keep security headers current

## Testing

### Test Rate Limiting
```bash
# Should succeed
curl http://localhost:3000/api/health

# Should fail after 15 requests in 1 minute
for i in {1..20}; do
  curl http://localhost:3000/api/users/profile \
    -H "Authorization: Bearer <token>"
done
```

### Test API Key Authentication
```bash
# Create API key
KEY=$(curl -X POST http://localhost:3000/api/api-keys \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"test"}' | jq -r '.apiKey.key')

# Use API key
curl -H "x-api-key: $KEY" \
  http://localhost:3000/api/balances
```

## Security Checklist

- [x] Rate limiting implemented
- [x] API key authentication implemented
- [x] Input validation implemented
- [x] XSS prevention implemented
- [x] NoSQL injection prevention implemented
- [x] CORS configured
- [x] Security headers configured
- [x] HSTS enabled
- [x] CSP configured
- [x] Login brute force protection
- [x] Account creation flood protection
- [x] Payment rate limiting
- [x] Balance query rate limiting
- [x] HTTP parameter pollution prevention
- [x] Payload size limits

## Monitoring and Alerts

### Key Metrics to Monitor
1. **Rate limit hits** - Track 429 responses
2. **Failed authentication** - Track 401 responses
3. **Validation errors** - Track 400 responses
4. **API key usage** - Monitor last_used_at
5. **Key rotations** - Audit key rotation events

### Recommended Alerts
- High rate of 429 responses from single IP
- Failed login attempts > 5 per minute
- API keys not rotated for 90+ days
- Unusual API key access patterns

## Troubleshooting

### "Too many requests" errors
1. Check your rate limits
2. Implement exponential backoff
3. Use API key authentication (higher limits)
4. Contact support to request limit increase

### API key not working
1. Verify `x-api-key` header is set
2. Check API key is active (not revoked)
3. Check IP whitelist if configured
4. Verify API key hasn't expired

### CORS errors
1. Verify origin is in CORS_ORIGIN env variable
2. Check request headers are in allowedHeaders
3. Ensure credentials are handled correctly

## Future Enhancements

- [ ] Redis-based distributed rate limiting
- [ ] Rate limiting analytics dashboard
- [ ] API key usage analytics
- [ ] Automatic key rotation policies
- [ ] OAuth2 integration
- [ ] WebAuthn/2FA support
- [ ] IP reputation checking
- [ ] Machine learning-based anomaly detection
