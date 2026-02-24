# API Versioning Documentation

## Overview
The API supports versioning to ensure backward compatibility and smooth transitions between API versions.

## Supported Versions

### V1 (Deprecated)
- **Status**: Deprecated
- **Sunset Date**: 2025-12-31
- **Base URL**: `/api/v1/*`
- **Notes**: All v1 endpoints return deprecation headers. Please migrate to v2.

### V2 (Current)
- **Status**: Active
- **Base URL**: `/api/v2/*` or `/api/*` (default)
- **Notes**: Current stable version with all latest features.

## Usage

### Accessing Versioned Endpoints

**V1 (Deprecated):**
```
GET /api/v1/users
GET /api/v1/transactions
```

**V2 (Current):**
```
GET /api/v2/users
GET /api/v2/transactions
```

**Default (V2):**
```
GET /api/users
GET /api/transactions
```

## Deprecation Headers

When using deprecated API versions (v1), the following headers are included in responses:

- `X-API-Version`: Current API version being used
- `X-API-Deprecated`: Set to "true" for deprecated versions
- `X-API-Sunset-Date`: Date when the API version will be discontinued
- `Warning`: Human-readable deprecation message

Example:
```
X-API-Version: v1
X-API-Deprecated: true
X-API-Sunset-Date: 2025-12-31
Warning: 299 - "API v1 is deprecated. Please migrate to v2. Sunset date: 2025-12-31"
```

## Version Differences

### V1 → V2 Changes
- Added `/exports` endpoint for transaction history export (CSV/PDF)
- Enhanced webhook functionality
- All existing endpoints remain compatible

## Migration Guide

1. Update your API base URL from `/api/v1/*` to `/api/v2/*`
2. Test all endpoints in your integration
3. Monitor deprecation headers in responses
4. Complete migration before sunset date (2025-12-31)

## Best Practices

- Always specify the API version explicitly in production
- Monitor deprecation headers in your application logs
- Plan migrations well before sunset dates
- Use v2 for all new integrations
