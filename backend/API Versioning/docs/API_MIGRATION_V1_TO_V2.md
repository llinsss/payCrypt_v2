# API Migration Guide: V1 to V2

## Overview

This guide helps you migrate from API v1 to v2. V1 will be sunset 6 months after v2 launch.

## Key Changes

### 1. User Object Structure

**V1 Format:**

```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john.doe@example.com"
}
```

**V2 Format:**

```json
{
  "id": 1,
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "createdAt": "2024-01-15T10:00:00Z"
}
```

**Changes:**

- `name` field split into `firstName` and `lastName`
- Added `createdAt` timestamp field

### 2. Response Structure

**V1 Response:**

```json
{
  "data": [...],
  "meta": {
    "version": "v1",
    "deprecated": true,
    "message": "..."
  }
}
```

**V2 Response:**

```json
{
  "data": [...],
  "meta": {
    "version": "v2",
    "timestamp": "2024-02-22T10:00:00Z"
  }
}
```

**Changes:**

- Removed deprecation fields from meta
- Added `timestamp` field for request time

### 3. Endpoint Changes

| V1 Endpoint             | V2 Endpoint             | Changes                 |
| ----------------------- | ----------------------- | ----------------------- |
| `GET /api/v1/users`     | `GET /api/v2/users`     | Response format changed |
| `GET /api/v1/users/:id` | `GET /api/v2/users/:id` | Response format changed |
| N/A                     | `POST /api/v2/users`    | New endpoint added      |

## Migration Steps

### Step 1: Update Base URL

Change your API base URL from `/api/v1` to `/api/v2`:

```javascript
// Before
const API_BASE = "https://api.example.com/api/v1";

// After
const API_BASE = "https://api.example.com/api/v2";
```

### Step 2: Update User Object Handling

**JavaScript/TypeScript Example:**

```typescript
// V1 Interface
interface UserV1 {
  id: number;
  name: string;
  email: string;
}

// V2 Interface
interface UserV2 {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
}

// Migration helper
function migrateUser(v1User: UserV1): UserV2 {
  const [firstName, ...lastNameParts] = v1User.name.split(" ");
  return {
    id: v1User.id,
    firstName,
    lastName: lastNameParts.join(" "),
    email: v1User.email,
    createdAt: new Date().toISOString(), // Placeholder
  };
}
```

### Step 3: Update API Calls

**Before (V1):**

```javascript
async function getUsers() {
  const response = await fetch("/api/v1/users");
  const { data } = await response.json();
  return data.map((user) => ({
    id: user.id,
    displayName: user.name,
    email: user.email,
  }));
}
```

**After (V2):**

```javascript
async function getUsers() {
  const response = await fetch("/api/v2/users");
  const { data } = await response.json();
  return data.map((user) => ({
    id: user.id,
    displayName: `${user.firstName} ${user.lastName}`,
    email: user.email,
    createdAt: user.createdAt,
  }));
}
```

### Step 4: Test Your Integration

1. **Parallel Testing**: Run both v1 and v2 in parallel
2. **Compare Results**: Verify data consistency
3. **Update Tests**: Update your test suite for v2
4. **Monitor Errors**: Watch for any integration issues

## Code Examples

### Python Example

```python
# V1
import requests

response = requests.get('https://api.example.com/api/v1/users')
users = response.json()['data']
for user in users:
    print(f"Name: {user['name']}")

# V2
response = requests.get('https://api.example.com/api/v2/users')
users = response.json()['data']
for user in users:
    print(f"Name: {user['firstName']} {user['lastName']}")
    print(f"Created: {user['createdAt']}")
```

### cURL Examples

```bash
# V1
curl -X GET https://api.example.com/api/v1/users

# V2
curl -X GET https://api.example.com/api/v2/users

# V2 - Create user
curl -X POST https://api.example.com/api/v2/users \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com"
  }'
```

## Breaking Changes Checklist

- [ ] Update base URL to `/api/v2`
- [ ] Split `name` field into `firstName` and `lastName`
- [ ] Handle new `createdAt` field
- [ ] Update response parsing for new meta structure
- [ ] Update all API client code
- [ ] Update tests
- [ ] Deploy to staging environment
- [ ] Test thoroughly
- [ ] Deploy to production
- [ ] Monitor for errors

## Rollback Plan

If you encounter issues with v2:

1. Revert base URL to `/api/v1`
2. V1 will remain available for 6 months
3. Report issues to api-support@example.com
4. Plan another migration attempt

## Timeline

- **Month 0**: V2 launched, V1 deprecated
- **Month 3**: Recommended migration deadline
- **Month 5**: Final warning emails sent
- **Month 6**: V1 sunset - endpoints removed

## Support

- **Documentation**: `/docs/API_VERSIONING.md`
- **Email**: api-support@example.com
- **Slack**: #api-support
- **Office Hours**: Tuesdays 2-4 PM EST

## FAQ

**Q: Can I use both v1 and v2 simultaneously?**
A: Yes, during the 6-month transition period.

**Q: What happens after v1 sunset?**
A: V1 endpoints will return 404 errors.

**Q: How do I know if I'm using v1?**
A: Check for `X-API-Deprecation` header in responses.

**Q: Is there a sandbox for testing v2?**
A: Yes, use `https://sandbox.api.example.com/api/v2`

**Q: Will my API keys work with v2?**
A: Yes, authentication remains unchanged.
