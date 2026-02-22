export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
}

export interface EndpointRateLimitConfig {
  [endpoint: string]: RateLimitConfig;
}

export const rateLimitsConfig = {
  anonymous: {
    windowMs: parseInt(
      process.env.RATE_LIMIT_ANONYMOUS_WINDOW_MS || "900000",
      10,
    ),
    max: parseInt(process.env.RATE_LIMIT_ANONYMOUS_MAX || "100", 10),
    message: "Too many requests from this IP, please try again later",
  },
  authenticated: {
    windowMs: parseInt(
      process.env.RATE_LIMIT_AUTHENTICATED_WINDOW_MS || "900000",
      10,
    ),
    max: parseInt(process.env.RATE_LIMIT_AUTHENTICATED_MAX || "1000", 10),
    message: "Too many requests, please try again later",
  },
  admin: {
    windowMs: parseInt(process.env.RATE_LIMIT_ADMIN_WINDOW_MS || "900000", 10),
    max: parseInt(process.env.RATE_LIMIT_ADMIN_MAX || "5000", 10),
    message: "Rate limit exceeded",
  },
  endpoints: {
    "/api/auth/login": {
      windowMs: parseInt(
        process.env.RATE_LIMIT_LOGIN_WINDOW_MS || "900000",
        10,
      ),
      max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || "5", 10),
      message: "Too many login attempts, please try again later",
    },
    "/api/transactions": {
      windowMs: parseInt(
        process.env.RATE_LIMIT_TRANSACTIONS_WINDOW_MS || "60000",
        10,
      ),
      max: parseInt(process.env.RATE_LIMIT_TRANSACTIONS_MAX || "100", 10),
      message: "Too many transaction requests",
    },
  } as EndpointRateLimitConfig,
  whitelist: process.env.RATE_LIMIT_WHITELIST?.split(",").map((ip) =>
    ip.trim(),
  ) || ["127.0.0.1", "::1"],
};
