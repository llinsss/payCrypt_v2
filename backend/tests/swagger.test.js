import { jest } from "@jest/globals";
import { buildSwaggerServers } from "../config/swagger.js";

describe("buildSwaggerServers", () => {
  // ─── Development (default) ──────────────────────────────────────

  it("returns localhost entries in development", () => {
    const servers = buildSwaggerServers({ NODE_ENV: "development", PORT: "4000" });

    expect(servers).toEqual([
      { url: "http://localhost:4000/api/v2", description: expect.stringContaining("v2") },
      { url: "http://localhost:4000/api/v1", description: expect.stringContaining("v1") },
      { url: "http://localhost:4000", description: expect.stringContaining("root") },
    ]);
  });

  it("defaults PORT to 5002 when not set", () => {
    const servers = buildSwaggerServers({ NODE_ENV: "development" });

    expect(servers[0].url).toBe("http://localhost:5002/api/v2");
  });

  it("appends PUBLIC_BASE_URL as staging entry in development", () => {
    const servers = buildSwaggerServers({
      NODE_ENV: "development",
      PORT: "3000",
      PUBLIC_BASE_URL: "https://staging.taggedpay.xyz",
    });

    expect(servers).toHaveLength(4);
    expect(servers[3]).toEqual({
      url: "https://staging.taggedpay.xyz/api/v2",
      description: expect.stringContaining("Staging"),
    });
  });

  // ─── Production ─────────────────────────────────────────────────

  it("omits localhost entries in production", () => {
    const servers = buildSwaggerServers({
      NODE_ENV: "production",
      PORT: "5002",
      PUBLIC_BASE_URL: "https://taggedpay.xyz",
    });

    const urls = servers.map((s) => s.url);
    expect(urls.every((u) => !u.includes("localhost"))).toBe(true);
  });

  it("uses PUBLIC_BASE_URL for production servers", () => {
    const servers = buildSwaggerServers({
      NODE_ENV: "production",
      PUBLIC_BASE_URL: "https://taggedpay.xyz",
    });

    expect(servers).toEqual([
      { url: "https://taggedpay.xyz/api/v2", description: expect.stringContaining("v2") },
      { url: "https://taggedpay.xyz/api/v1", description: expect.stringContaining("v1") },
    ]);
  });

  it("strips trailing slashes from PUBLIC_BASE_URL", () => {
    const servers = buildSwaggerServers({
      NODE_ENV: "production",
      PUBLIC_BASE_URL: "https://taggedpay.xyz///",
    });

    expect(servers[0].url).toBe("https://taggedpay.xyz/api/v2");
  });

  // ─── Edge cases ─────────────────────────────────────────────────

  it("returns a relative fallback when production has no PUBLIC_BASE_URL", () => {
    const servers = buildSwaggerServers({
      NODE_ENV: "production",
    });

    expect(servers).toHaveLength(1);
    expect(servers[0].url).toBe("/api/v2");
  });

  it("never returns an empty array", () => {
    const servers = buildSwaggerServers({});
    expect(servers.length).toBeGreaterThan(0);
  });

  // ─── Snapshot stability ─────────────────────────────────────────

  it("development servers snapshot", () => {
    const servers = buildSwaggerServers({ NODE_ENV: "development", PORT: "5002" });
    expect(servers).toMatchSnapshot();
  });

  it("production servers snapshot", () => {
    const servers = buildSwaggerServers({
      NODE_ENV: "production",
      PUBLIC_BASE_URL: "https://taggedpay.xyz",
    });
    expect(servers).toMatchSnapshot();
  });
});
