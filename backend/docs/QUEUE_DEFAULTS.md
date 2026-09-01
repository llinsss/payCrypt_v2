# BullMQ Retention & Backpressure Defaults

All queues under `backend/queues/` should build their `defaultJobOptions`
through `buildJobOptions()` in [`queues/queueDefaults.js`](../queues/queueDefaults.js)
instead of hand-rolling `attempts`/`backoff`/`removeOnComplete`/`removeOnFail`.

## Defaults

- `attempts: 3`, exponential backoff starting at 5s
- `removeOnComplete: { age: 24h, count: 1000 }`
- `removeOnFail: { age: 7d, count: 5000 }`

A queue can override any field (e.g. `transactionConfirmation` uses
`attempts: 10`) — pass only the fields that differ and the rest are merged
in from the shared defaults.

## Payload cap

`assertPayloadSize(data)` throws if a job payload exceeds 256KB. Call it
before `queue.add(...)` for any producer that forwards user- or
webhook-controlled payloads (see `WebhookDeliveryService`).

## Backpressure alerting

`attachQueueDepthAlert(queue, label)` polls `getJobCounts()` every 60s and
logs + reports to Sentry when combined waiting/active/delayed depth exceeds
5000 jobs, or the oldest waiting job is older than 30 minutes. Every queue
constructed with a live Redis connection should call this alongside
`attachRedisErrorAlert`.
