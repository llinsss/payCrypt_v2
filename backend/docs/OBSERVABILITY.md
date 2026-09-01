# Backend Observability

## Health & Probe Endpoints

The backend exposes distinct liveness, readiness, and diagnostic endpoints so
load balancers and orchestrators get one unambiguous signal per probe type:

| Endpoint | Purpose | Checks dependencies? | Use for |
|---|---|---|---|
| `GET /health` | Liveness (root alias) | No | Container/orchestrator liveness probe (e.g. Kubernetes `livenessProbe`). Always `200` while the process is up and the event loop is responsive; never fails because of a downstream outage. |
| `GET /api/health/live` | Liveness (versioned) | No | Same contract as `GET /health`, under the `/api` namespace. |
| `GET /api/health/ready` | Readiness | Yes — database, Redis | Load balancer / orchestrator readiness probe (e.g. Kubernetes `readinessProbe`). Returns `503` when a critical dependency (database or Redis) is down, so traffic is routed away until it recovers. |
| `GET /api/health` | Full dependency status | Yes — database, Redis, Stellar Horizon, Stellar stream | Dashboards, on-call diagnostics, and status pages. Returns `200` when fully healthy, `503` when degraded or fully down, with per-dependency detail (latency, pool stats, messages). |

**Contract:**
- Liveness must never depend on external systems — a database or Redis outage
  should not cause a liveness probe to fail and trigger a restart of an
  otherwise-healthy process.
- Readiness must depend on the systems required to safely serve traffic
  (database, Redis) so an orchestrator can pull an instance out of rotation
  during a dependency outage without restarting it.
- `GET /api/health` is a superset diagnostic endpoint, not a probe target —
  it also checks Stellar Horizon reachability, which is informative but not
  required for the process to be considered live or ready.

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

