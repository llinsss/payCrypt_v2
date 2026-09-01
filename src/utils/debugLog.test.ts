import { test } from "node:test";
import assert from "node:assert/strict";
import { createDebugLogger } from "./debugLog.ts";

function captureConsoleLog(fn: () => void): unknown[][] {
  const calls: unknown[][] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    calls.push(args);
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return calls;
}

test("logs nothing when disabled (production-equivalent)", () => {
  const debugLog = createDebugLogger(false);
  const calls = captureConsoleLog(() => {
    debugLog("API call successful:", "/balances", { balance: 12345 });
  });
  assert.equal(calls.length, 0);
});

test("logs when explicitly enabled (opt-in dev debugging)", () => {
  const debugLog = createDebugLogger(true);
  const calls = captureConsoleLog(() => {
    debugLog("API call successful:", "/balances");
  });
  assert.equal(calls.length, 1);
});
