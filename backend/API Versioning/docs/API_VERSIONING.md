# API Versioning Guide

## Overview

This API uses URL-based versioning to support backward compatibility and smooth migrations when making breaking changes.

## Versioning Strategy

- **Type**: URI-based versioning
- **Format**: `/api/v{version}/{resource}`
- **Current Versions**: v1 (deprecated), v2 (current)

## Version Information

### V1 (Deprecated)

- **Status**: Deprecated
- **Sunset Date**: 6 months from v2 launch
- **Support**: Maintenance only, no new features

### V2 (Current)

- **Status**: Active
- **Released**: Current
- **Support**: Full support with new features

## How to Use

### Making Requests

Include the version in the URL path:

```bash
# V1 endpoint (deprecated)
GET /api/v1/users

# V2 endpoint (current)
GET /api/v2/users
```

### Deprecation Headers

V1 responses include deprecation headers:

```
X-API-Deprecation: true
X-API-Deprecated-Version: v1
X-API-Sunset: 2024-08-21
X-API-Current-Version: v2
Link: </docs/API_MIGRATION_V1_TO_V2.md>; rel="deprecation"
```

## Version Detection

The API automatically detects the version from the URL path. If no version is specified or an invalid version is used, the API returns a 404 error.

## Best Practices

1. **Always specify version**: Include the version in all API calls
2. **Monitor deprecation headers**: Check response headers for deprecation notices
3. **Plan migrations early**: Start migrating to v2 as soon as possible
4. **Test thoroughly**: Test your integration with v2 before the v1 sunset date
5. **Subscribe to updates**: Monitor API changelog for version updates

## Migration Timeline

| Phase            | Timeline   | Action                             |
| ---------------- | ---------- | ---------------------------------- |
| V2 Launch        | Day 0      | V2 available, V1 marked deprecated |
| Migration Period | Months 1-5 | Both versions supported            |
| Sunset Warning   | Month 5    | Final warning for v1 users         |
| V1 Sunset        | Month 6    | V1 endpoints removed               |

## Error Handling

### Invalid Version

```json
{
  "statusCode": 404,
  "message": "Cannot GET /api/v3/users",
  "error": "Not Found"
}
```

### Version Required

If you attempt to access an endpoint without a version, you'll receive a 404 error.

## Support

For questions about API versioning:

- See migration guide: `/docs/API_MIGRATION_V1_TO_V2.md`
- Contact: api-support@example.com
- Changelog: `/docs/CHANGELOG.md`
