# Fee Estimation Service

`backend/services/FeeEstimationService.js` caches network fee tiers
(`slow`, `normal`, `fast`) and refreshes them periodically (every 60s by
default).

## Lifecycle

Importing the module does **not** start any timers. The owner of the process
starts and stops the refresh loop explicitly:

```js
import feeEstimationService from "./services/FeeEstimationService.js";

feeEstimationService.start(); // fetches immediately, then every updateInterval
// ...
feeEstimationService.stop();  // e.g. from the graceful shutdown handler
```

- `start()` is idempotent: calling it while running returns `false` and does
  not create a second interval.
- `stop()` clears the interval and can be called safely at any time; the
  service can be started again afterwards.
- `isRunning()` reports whether the refresh loop is active.
- The interval is `unref`'d, so it never keeps the process alive on its own.

`getEstimates()` returns the cached tiers and `lastUpdated`, or an error
payload until the first fetch has completed.

For tests, construct an isolated instance with a custom interval:

```js
import { FeeEstimationService } from "./services/FeeEstimationService.js";

const service = new FeeEstimationService({ updateInterval: 1000 });
```

Tests: `backend/tests/feeEstimationService.test.js`.
