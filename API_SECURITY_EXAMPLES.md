# API Security - Client Integration Examples

## Authentication Methods

### Method 1: JWT Token Authentication (User Sessions)

Best for: Web applications, user-initiated actions

```bash
# 1. Login to get token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'

# Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": "...", "email": "user@example.com" }
}

# 2. Use token for requests
curl http://localhost:3000/api/balances \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Method 2: API Key Authentication (Service-to-Service)

Best for: Backend services, third-party integrations, scheduled tasks

```bash
# 1. Create an API key (with JWT token)
curl -X POST http://localhost:3000/api/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Backend",
    "scopes": "read,write,payments",
    "ipWhitelist": "192.168.1.100,10.0.0.5",
    "expiresIn": 365
  }'

# Response:
{
  "apiKey": {
    "id": 1,
    "key": "8f42a0d1c5e8b9f2a1c3d5e7f9b2d4e6",
    "name": "Production Backend",
    "scopes": "read,write,payments",
    "createdAt": "2026-01-23T10:00:00Z",
    "expiresAt": "2027-01-23T10:00:00Z"
  }
}

# 2. Use API key for requests
curl http://localhost:3000/api/balances \
  -H "x-api-key: 8f42a0d1c5e8b9f2a1c3d5e7f9b2d4e6"
```

## JavaScript/Node.js Examples

### Fetch with JWT Token

```javascript
// src/api/client.js
const API_BASE = process.env.REACT_APP_API_URL;
let authToken = localStorage.getItem('authToken');

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const data = await res.json();
  if (data.token) {
    authToken = data.token;
    localStorage.setItem('authToken', data.token);
  }
  return data;
}

export async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
    ...options.headers
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (res.status === 401) {
    // Token expired - clear and redirect to login
    localStorage.removeItem('authToken');
    authToken = null;
    window.location.href = '/login';
  }

  return res.json();
}

// Usage
export const getBalance = () => apiCall('/api/balances');
export const createTransaction = (data) => 
  apiCall('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(data)
  });
```

### Axios with JWT Token

```javascript
// src/api/axios.js
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Usage
export const getBalance = () => api.get('/api/balances');
export const createTransaction = (data) => api.post('/api/transactions', data);
```

### API Key Client (Node.js)

```javascript
// src/apiKeyClient.js
import axios from 'axios';

export class PayCryptClient {
  constructor(apiKey, baseUrl = 'http://localhost:3000') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });
  }

  async getBalance(balanceId) {
    const res = await this.client.get(`/api/balances/${balanceId}`);
    return res.data;
  }

  async createTransaction(data) {
    const res = await this.client.post('/api/transactions', data);
    return res.data;
  }

  async getAllTransactions() {
    const res = await this.client.get('/api/transactions');
    return res.data;
  }

  async listBalances() {
    const res = await this.client.get('/api/balances');
    return res.data;
  }
}

// Usage
const client = new PayCryptClient(process.env.PAYCRYPT_API_KEY);
const balance = await client.getBalance(123);
```

## cURL Examples

### Register New Account
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "SecurePass123!@",
    "fullName": "John Doe"
  }'

# Response:
{
  "status": "success",
  "message": "Account created successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "newuser@example.com",
    "fullName": "John Doe"
  }
}
```

### Rate Limit Response
```bash
# After hitting rate limit
curl http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com", "password": "Pass123!@"}'

# Response (HTTP 429):
{
  "error": "Too many accounts created from this IP, please try again later"
}

# Response Headers:
RateLimit-Limit: 5
RateLimit-Remaining: 0
RateLimit-Reset: 1674123456
```

### Invalid Input
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "invalid-email",
    "password": "weak"
  }'

# Response (HTTP 400):
{
  "error": "Please provide a valid email address",
  "field": "email"
}
```

### Successful Balance Query
```bash
curl http://localhost:3000/api/balances \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "x-api-key: YOUR_API_KEY"

# Response:
{
  "count": 3,
  "balances": [
    {
      "id": 1,
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "currency": "USD",
      "amount": "1000.00",
      "createdAt": "2026-01-20T10:00:00Z"
    },
    ...
  ]
}
```

## Error Handling Examples

### React Component with Error Handling

```javascript
// src/components/BalanceView.jsx
import { useState, useEffect } from 'react';
import { getBalance } from '../api/client';

export function BalanceView({ balanceId }) {
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        setLoading(true);
        const data = await getBalance(balanceId);
        setBalance(data);
        setError(null);
      } catch (err) {
        // Handle different error types
        if (err.status === 401) {
          setError('Session expired. Please log in again.');
        } else if (err.status === 429) {
          setError('Too many requests. Please wait a moment.');
        } else if (err.status === 404) {
          setError('Balance not found.');
        } else {
          setError(err.message || 'Failed to load balance');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();
  }, [balanceId]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  
  return (
    <div>
      <h2>{balance.currency}</h2>
      <p>Amount: {balance.amount}</p>
    </div>
  );
}
```

### Retry Logic with Exponential Backoff

```javascript
async function apiCallWithRetry(endpoint, options = {}, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall(endpoint, options);
    } catch (error) {
      lastError = error;
      
      // Don't retry on 401, 403, 404, 400
      if ([401, 403, 404, 400].includes(error.status)) {
        throw error;
      }
      
      // Retry on 429 (rate limit) or 5xx errors
      if ([429, 500, 502, 503].includes(error.status)) {
        const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
        console.log(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

// Usage
const balance = await apiCallWithRetry('/api/balances/123');
```

## Environment Configuration

### Frontend (.env)
```env
REACT_APP_API_URL=http://localhost:3000
REACT_APP_JWT_STORAGE_KEY=authToken
```

### Backend (.env)
```env
# Server
NODE_ENV=production
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=paycrypt
DB_USER=postgres
DB_PASSWORD=password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Security
JWT_SECRET=your_jwt_secret_key_here
CORS_ORIGIN=http://localhost:5173,https://yourdomain.com
BULL_ADMIN_PASS=secure_admin_password

# API Keys
API_KEY_EXPIRY_DAYS=365
MAX_API_KEYS_PER_USER=10
```

## Testing Your Integration

### Postman Collection

```json
{
  "info": {
    "name": "PayCrypt API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Auth",
      "item": [
        {
          "name": "Register",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/api/auth/register",
            "body": {
              "mode": "raw",
              "raw": "{\"email\": \"test@example.com\", \"password\": \"Test123!@\"}"
            }
          }
        },
        {
          "name": "Login",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/api/auth/login",
            "body": {
              "mode": "raw",
              "raw": "{\"email\": \"test@example.com\", \"password\": \"Test123!@\"}"
            }
          }
        }
      ]
    },
    {
      "name": "Balances",
      "item": [
        {
          "name": "Get Balances",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/api/balances",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ]
          }
        }
      ]
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000"
    },
    {
      "key": "token",
      "value": ""
    }
  ]
}
```

---

**Created**: January 23, 2026
**Updated**: January 23, 2026
