# Backend Observability

The backend sends Express request transactions to Sentry when `SENTRY_DSN` is
configured. Knex queries, Redis commands, and BullMQ job lifecycles are added as
child spans. Sampling is controlled with `SENTRY_TRACES_SAMPLE_RATE` and
`SENTRY_PROFILES_SAMPLE_RATE`.

Configure the following Sentry alert in the project dashboard because alert
rules are project configuration, not application code:

- Dataset: transaction events
- Filter: transaction name contains `/transactions`
- Metric: p95 transaction duration
- Threshold: greater than 2 seconds
- Window: 5 minutes

Do not set the sample rates to `1` in production unless the Sentry plan and
traffic volume have been reviewed.

