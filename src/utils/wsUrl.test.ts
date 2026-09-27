import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWebSocketUrl } from "./wsUrl.ts";

test("accepts a valid ws:// url", () => {
  assert.strictEqual(resolveWebSocketUrl("ws://localhost:3001"), "ws://localhost:3001");
});

test("accepts a valid wss:// url and trims whitespace", () => {
  assert.strictEqual(
    resolveWebSocketUrl("  wss://api.example.com/ws  "),
    "wss://api.example.com/ws"
  );
});

test("throws visibly when the url is missing", () => {
  assert.throws(() => resolveWebSocketUrl(undefined), /VITE_WS_URL is not set/);
  assert.throws(() => resolveWebSocketUrl(""), /VITE_WS_URL is not set/);
  assert.throws(() => resolveWebSocketUrl("   "), /VITE_WS_URL is not set/);
});

test("throws visibly when the scheme is invalid (mixed-content guard)", () => {
  assert.throws(
    () => resolveWebSocketUrl("http://localhost:3001"),
    /must start with ws:\/\/ or wss:\/\//
  );
});
