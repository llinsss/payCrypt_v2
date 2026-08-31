# Observability

The backend sends Express request transactions to Sentry when `SENTRY_DSN` is
configured. Keep Sentry sampling and alerting settings appropriate for the
configured environment.

## Deliberate Sentry error route

`GET /test-error` is a verification endpoint that deliberately throws an
exception. It is mounted only when `NODE_ENV` is not `production` (for example,
`development` or `test`). Production requests receive the normal 404 response;
there is no production route that can intentionally generate Sentry events.

Use the endpoint only in a controlled environment when validating Sentry
integration, and do not expose a development/test deployment to untrusted
traffic.
