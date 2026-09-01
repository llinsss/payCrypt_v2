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

## Authorization

Reads (`GET /tokens`, `GET /tokens/:id`) are public and cacheable. Mutations
that alter the token catalog (`POST /tokens`, `PUT /tokens/:id`,
`DELETE /tokens/:id`) require an authenticated admin (`authenticate` +
`requireAdmin`, i.e. a bearer token for a user with role `admin` or
`super_admin`). Anonymous callers receive `401`, and authenticated
non-admins receive `403`. See the OpenAPI spec for the security scheme.

