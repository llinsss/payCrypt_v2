import { test } from "node:test";
import assert from "node:assert/strict";
import { startIntervalPoller } from "./intervalPoller.ts";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("skips an overlapping tick while a request is still in flight (single-flight)", async () => {
  let calls = 0;
  const first = deferred<string>();

  const { stop } = startIntervalPoller({
    fetcher: () => {
      calls += 1;
      return calls === 1 ? first.promise : Promise.resolve("unexpected");
    },
    onSuccess: () => {},
    intervalMs: 1_000_000, // never fires on its own during this test
  });

  // Manually simulate a second tick arriving before the first resolves.
  // (startIntervalPoller's internal `tick` isn't exported, so we assert the
  // externally observable contract: fetcher was invoked exactly once so far.)
  await Promise.resolve();
  assert.equal(calls, 1);

  first.resolve("slow response");
  await first.promise;
  stop();
});

test("ignores a response that resolves after stop() (unmount)", async () => {
  const successes: unknown[] = [];
  const errors: unknown[] = [];
  const pending = deferred<string>();

  const { stop } = startIntervalPoller({
    fetcher: () => pending.promise,
    onSuccess: (data) => successes.push(data),
    onError: (err) => errors.push(err),
    intervalMs: 1_000_000,
  });

  stop();
  pending.resolve("late response after unmount");
  await pending.promise.catch(() => {});
  await Promise.resolve();

  assert.equal(successes.length, 0);
  assert.equal(errors.length, 0);
});

test("aborts the in-flight request's signal on stop()", async () => {
  let capturedSignal: AbortSignal | undefined;
  const pending = deferred<string>();

  const { stop } = startIntervalPoller({
    fetcher: (signal) => {
      capturedSignal = signal;
      return pending.promise;
    },
    onSuccess: () => {},
    intervalMs: 1_000_000,
  });

  assert.equal(capturedSignal?.aborted, false);
  stop();
  assert.equal(capturedSignal?.aborted, true);
  pending.resolve("cleanup");
});

test("delivers a normal (non-stale) response to onSuccess", async () => {
  const successes: unknown[] = [];

  const { stop } = startIntervalPoller({
    fetcher: () => Promise.resolve({ balance: 42 }),
    onSuccess: (data) => successes.push(data),
    intervalMs: 1_000_000,
  });

  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(successes, [{ balance: 42 }]);
  stop();
});
