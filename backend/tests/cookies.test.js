import { describe, expect, it, jest } from "@jest/globals";
import { csrfProtection } from "../middleware/cookies.js";
import { CSRF_COOKIE } from "../utils/authCookies.js";

const request = (method, cookies = {}, headers = {}) => ({
  method,
  path: "/transactions",
  cookies,
  get: (name) => headers[name],
});

const response = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
});

describe("CSRF protection", () => {
  it("rejects state-changing cookie requests without a matching token", () => {
    const res = response();
    const next = jest.fn();

    csrfProtection(request("POST", { [CSRF_COOKIE]: "cookie-token" }), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts state-changing cookie requests with a matching token", () => {
    const res = response();
    const next = jest.fn();
    const token = "csrf-token";

    csrfProtection(request("POST", { [CSRF_COOKIE]: token }, { "X-CSRF-Token": token }), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("does not require CSRF for legacy bearer requests during migration", () => {
    const res = response();
    const next = jest.fn();

    csrfProtection(request("POST", {}, { Authorization: "Bearer legacy-token" }), res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
