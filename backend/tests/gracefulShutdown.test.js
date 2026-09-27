import { describe, expect, it } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

describe("Graceful shutdown (server.js)", () => {
  it("handles both SIGTERM and SIGINT", () => {
    expect(serverSource).toContain('process.once("SIGTERM"');
    expect(serverSource).toContain('process.once("SIGINT"');
  });

  it("has a configurable shutdown deadline", () => {
    expect(serverSource).toContain("SHUTDOWN_DEADLINE_MS");
    expect(serverSource).toContain("deadline");
  });

  it("closes HTTP server first (stop traffic)", () => {
    const httpCloseIndex = serverSource.indexOf("httpServer.close");
    const socketCloseIndex = serverSource.indexOf("SocketService.io.close");
    const redisQuitIndex = serverSource.indexOf("redis.quit");
    const dbDestroyIndex = serverSource.indexOf("db.destroy");

    // HTTP should close before Socket.IO, Redis, and DB
    expect(httpCloseIndex).toBeGreaterThan(-1);
    expect(httpCloseIndex).toBeLessThan(socketCloseIndex);
    expect(httpCloseIndex).toBeLessThan(redisQuitIndex);
    expect(httpCloseIndex).toBeLessThan(dbDestroyIndex);
  });

  it("closes Socket.IO before Redis", () => {
    const socketIndex = serverSource.indexOf("SocketService.io.close");
    const redisIndex = serverSource.indexOf("redis.quit");
    expect(socketIndex).toBeLessThan(redisIndex);
  });

  it("closes Redis before database", () => {
    const redisIndex = serverSource.indexOf("redis.quit");
    const dbIndex = serverSource.indexOf("db.destroy");
    expect(redisIndex).toBeLessThan(dbIndex);
  });

  it("stops Stellar streams during shutdown", () => {
    // Within the shutdown function, not just anywhere
    const shutdownStart = serverSource.indexOf("const shutdown = async");
    const shutdownEnd = serverSource.indexOf("process.once", shutdownStart);
    const shutdownBlock = serverSource.slice(shutdownStart, shutdownEnd);

    expect(shutdownBlock).toContain("stellarStreamService.stop()");
  });

  it("clears background interval timers", () => {
    expect(serverSource).toContain("activeTimers");
    expect(serverSource).toContain("clearInterval");
  });

  it("prevents double shutdown", () => {
    expect(serverSource).toContain("if (shuttingDown) return");
  });

  it("forces exit on deadline with code 1", () => {
    expect(serverSource).toContain("process.exit(1)");
    expect(serverSource).toContain("deadline exceeded");
  });
});
