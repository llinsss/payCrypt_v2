import { describe, expect, it, jest } from "@jest/globals";
import { cacheControl, privateNoStore, publicCache } from "../middleware/cacheControl.js";

const response = () => {
  const headers = {};
  const res = {
    statusCode: 200,
    setHeader: jest.fn((name, value) => { headers[name] = value; }),
    status: jest.fn(function status(code) { this.statusCode = code; return this; }),
    end: jest.fn(),
    json: jest.fn(function json(body) { this.body = body; return this; }),
  };
  return { res, headers };
};

describe("cache control middleware", () => {
  it("sets public caching and a stable ETag for JSON responses", () => {
    const { res, headers } = response();
    const req = { headers: {} };
    const next = jest.fn();

    publicCache(3600)(req, res, next);
    res.json({ chains: [{ id: 1 }] });

    expect(next).toHaveBeenCalled();
    expect(headers["Cache-Control"]).toBe("public, max-age=3600");
    expect(headers.ETag).toMatch(/^"[a-f0-9]{64}"$/);
  });

  it("returns 304 when the representation matches If-None-Match", () => {
    const first = response();
    const req = { headers: {} };
    publicCache(3600)(req, first.res, jest.fn());
    first.res.json({ tokens: [] });

    const second = response();
    const conditionalReq = { headers: { "if-none-match": first.headers.ETag } };
    publicCache(3600)(conditionalReq, second.res, jest.fn());
    second.res.json({ tokens: [] });

    expect(second.res.status).toHaveBeenCalledWith(304);
    expect(second.res.end).toHaveBeenCalled();
    expect(second.res.body).toBeUndefined();
  });

  it("marks authenticated financial responses as private and non-cacheable", () => {
    const { res, headers } = response();
    privateNoStore({}, res, jest.fn());

    expect(headers["Cache-Control"]).toBe("private, no-store");
  });
});
