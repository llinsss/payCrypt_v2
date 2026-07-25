# API Cache Policy

The API uses explicit response policies so clients and intermediary caches do
not infer unsafe defaults.

| Endpoint | Policy | ETag |
| --- | --- | --- |
| `GET /chains` | `public, max-age=3600` | Yes |
| `GET /tokens` | `public, max-age=3600` | Yes |
| `GET /exchange-rates` | `public, max-age=900` | Yes |
| `GET /balances` | `private, no-store` | No |
| `GET /transactions` | `private, no-store` | No |

ETags are calculated from the JSON representation. Clients may send
`If-None-Match`; unchanged public responses return `304 Not Modified` without a
response body. Authenticated balances and transactions are never cacheable.

