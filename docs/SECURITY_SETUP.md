# Security Implementation - Quick Setup Guide

## What Was Implemented

This guide summarizes the security measures added to your PayCrypt API.

## 1. Installation

Install the new dependency:

```bash
cd backend
npm install sanitize-html
```

## 2. Database Migration

Run the migration to create the `api_keys` table:

```bash
npm run migrate
```

## 3. Environment Configuration

Add/update these in your `.env` file:

```env
# CORS - comma-separated list of allowed origins
CORS_ORIGIN=http://localhost:5173,https://yourdomain.com

# Redis configuration for rate limiting
REDIS_HOST=localhost
REDIS_PORT=6379

# Admin panel password
BULL_ADMIN_PASS=your_secure_password

# Node environment
NODE_ENV=production
```

## 4. Rate Limits Summary

| Endpoint | Limit | Window | By |
|----------|-------|--------|-----|
| `/api/auth/register` | 5 | 1 hour | IP |
| `/api/auth/login` | 10 failed | 15 min | Email/IP |
| `/api/transactions` (POST/PUT/DELETE) | 100 | 1 hour | API Key/User/IP |
| `/api/balances` (GET) | 1000 | 1 hour | API Key/User/IP |
| `/api/api-keys` (POST/rotate) | 5 | 1 hour | API Key/User/IP |
| All `/api` routes | 15 | 1 minute | IP |

## 5. Security Features Overview

### Rate Limiting ✅
- Global rate limiting (15 req/min)
- Account creation protection (5/hour)
- Login brute force protection (10 failures/15min)
- Payment rate limiting (100/hour)
- Balance query rate limiting (1000/hour)
- Strict operation protection (5/hour)

### Authentication ✅
- JWT token-based authentication (Bearer tokens)
- API key authentication (x-api-key header)
- API key scopes and permissions
- IP whitelist support for API keys
- Key expiration support
- Key rotation capability

### Input Security ✅
- Request validation with Joi schemas
- XSS prevention through HTML sanitization
- NoSQL injection prevention
- HTTP parameter pollution prevention
- Automatic input trimming
- Unknown field stripping

### HTTP Security ✅
- CORS properly configured
- Security headers (Helmet)
- HSTS enabled (1 year)
- Content Security Policy
- X-Frame-Options (deny)
- X-Content-Type-Options (nosniff)
- XSS Filter enabled
- Referrer Policy configured

### Error Handling ✅
- Proper HTTP status codes
- Rate limiting info in responses
- Field-specific validation errors
- Safe error messages in production
- Global error handler

## 6. API Key Management

### Create an API Key
```bash
curl -X POST http://localhost:3000/api/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My API Key",
    "scopes": "read,write,payments",
    "ipWhitelist": "192.168.1.1",
    "expiresIn": 90
  }'
```

### List Your API Keys
```bash
curl http://localhost:3000/api/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Use API Key for Requests
```bash
curl http://localhost:3000/api/balances \
  -H "x-api-key: YOUR_API_KEY"
```

### Rotate an API Key (Create New + Revoke Old)
```bash
curl -X POST http://localhost:3000/api/api-keys/KEY_ID/rotate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Revoke an API Key
```bash
curl -X DELETE http://localhost:3000/api/api-keys/KEY_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 7. Files Created

```
backend/
  config/
    └─ rateLimiting.js              (Rate limiting configuration)
  middleware/
    ├─ apiKeyAuth.js                (API key authentication)
    └─ validation.js                (Enhanced validation & sanitization)
  migrations/
    └─ 20260123000000_create_api_keys_table.js
  models/
    └─ ApiKey.js                    (API key model)
  controllers/
    └─ apiKeyController.js          (API key management)
  routes/
    └─ apiKeys.js                   (API key endpoints)
```

## 8. Files Modified

```
backend/
  ├─ app.js                         (Added security middleware)
  ├─ package.json                   (Added sanitize-html)
  routes/
    ├─ auth.js                      (Added rate limiters)
    ├─ transactions.js              (Added payment rate limiter)
    ├─ balances.js                  (Added balance rate limiter)
    └─ index.js                     (Added API keys route)
```

## 9. Testing the Implementation

### Test Rate Limiting
```bash
# Make multiple requests quickly
for i in {1..20}; do
  curl http://localhost:3000/api/health
done
# Should get 429 (Too Many Requests) after limit reached
```

### Test API Key Authentication
```bash
# Create a key, then use it
curl -H "x-api-key: your_key_here" \
  http://localhost:3000/api/balances
```

### Test Input Validation
```bash
# Invalid email format
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "invalid", "password": "Test123!@"}'
# Should return 400 with error message
```

## 10. Monitoring

### Check Rate Limit Headers
All responses include rate limit information:
```
RateLimit-Limit: 15
RateLimit-Remaining: 12
RateLimit-Reset: 1674123456
```

### Monitor Failed Attempts
The system tracks:
- Failed login attempts (helps prevent brute force)
- Rate limit violations (IP bans)
- Validation errors
- Authentication failures

## 11. Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure `CORS_ORIGIN` for your domain
- [ ] Update `BULL_ADMIN_PASS` to a strong password
- [ ] Ensure Redis is running and configured
- [ ] Update security headers if needed
- [ ] Set up rate limit monitoring/alerts
- [ ] Enable HTTPS (critical!)
- [ ] Test API key functionality
- [ ] Document API key usage for clients
- [ ] Set up key rotation policy

## 12. Common Issues & Solutions

### "Too many requests" on legitimate traffic
- Use API key authentication (higher limits)
- Configure IP whitelist on API keys
- Request a limit increase from support

### API keys not working
- Verify `x-api-key` header is present
- Check API key is active (not revoked)
- Verify IP whitelist if configured
- Check expiration date

### CORS errors in frontend
- Verify your frontend URL is in `CORS_ORIGIN`
- Check request headers are in allowedHeaders
- Ensure you're using proper HTTP methods

### Rate limits seem too strict
- Adjust limits in `config/rateLimiting.js` if needed
- Use Redis for distributed rate limiting
- Implement exponential backoff on client side

## 13. Documentation

Full documentation available in `SECURITY.md` with:
- Detailed feature descriptions
- All endpoints and usage
- Best practices
- Troubleshooting guide
- Future enhancements

## 14. Next Steps

1. ✅ Install dependencies: `npm install`
2. ✅ Run migrations: `npm run migrate`
3. ✅ Update `.env` file
4. ✅ Test the implementation
5. ✅ Deploy to production
6. ✅ Monitor and adjust limits as needed

## Support

For issues or questions about the security implementation:
1. Check `SECURITY.md` for detailed documentation
2. Review error messages (they're descriptive)
3. Check rate limit headers in responses
4. Enable debug logging in development

---

**Last Updated**: January 23, 2026
**Version**: 1.0.0
