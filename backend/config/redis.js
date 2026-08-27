import { createClient } from "redis";
import dotenv from "dotenv";
import { instrumentRedisClient } from "../observability/sentry.js";
dotenv.config();

export const IDEMPOTENCY_PREFIX = process.env.IDEMPOTENCY_PREFIX || "idem:v1:";

const redisDisabled = process.env.REDIS_DISABLED === "true" || process.env.NODE_ENV === "test";
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';


const createMockableAsyncFunction = (defaultImpl = async () => null) => {
  let impl = defaultImpl;
  const onceQueue = [];
  const fn = async (...args) => {
    fn.mock.calls.push(args);
    if (onceQueue.length > 0) {
      const next = onceQueue.shift();
      if (next.reject) throw next.value;
      if (next.impl) return next.impl(...args);
      return next.value;
    }
    return impl(...args);
  };
  fn._isMockFunction = true;
  fn.getMockName = () => "mockFn";
  fn.mockName = () => fn;
  fn.mock = { calls: [] };
  fn.mockClear = () => {
    fn.mock.calls = [];
    onceQueue.length = 0;
    return fn;
  };
  fn.mockResolvedValue = (value) => {
    fn.mock.calls = [];
    onceQueue.length = 0;
    impl = async () => value;
    return fn;
  };
  fn.mockResolvedValueOnce = (value) => {
    if (onceQueue.length === 0) fn.mock.calls = [];
    onceQueue.push({ value });
    return fn;
  };
  fn.mockRejectedValue = (value) => {
    fn.mock.calls = [];
    onceQueue.length = 0;
    impl = async () => { throw value; };
    return fn;
  };
  fn.mockRejectedValueOnce = (value) => {
    if (onceQueue.length === 0) fn.mock.calls = [];
    onceQueue.push({ value, reject: true });
    return fn;
  };
  fn.mockImplementation = (newImpl) => {
    fn.mock.calls = [];
    onceQueue.length = 0;
    impl = newImpl;
    return fn;
  };
  fn.mockImplementationOnce = (newImpl) => {
    if (onceQueue.length === 0) fn.mock.calls = [];
    onceQueue.push({ impl: newImpl });
    return fn;
  };
  return fn;
};

const createDisabledRedisClient = () => ({
  isOpen: false,
  connect: createMockableAsyncFunction(async () => undefined),
  on: () => {},
  get: createMockableAsyncFunction(async () => null),
  set: createMockableAsyncFunction(async () => null),
  setEx: createMockableAsyncFunction(async () => 'OK'),
  del: createMockableAsyncFunction(async () => 0),
  publish: createMockableAsyncFunction(async () => 0),
  eval: createMockableAsyncFunction(async () => 0),
  expire: createMockableAsyncFunction(async () => true),
  pExpire: createMockableAsyncFunction(async () => true),
  zRemRangeByScore: createMockableAsyncFunction(async () => 0),
  zCard: createMockableAsyncFunction(async () => 0),
  zAdd: createMockableAsyncFunction(async () => 1),
  scan: createMockableAsyncFunction(async () => ({ cursor: 0, keys: [] })),
});

const createRedisClient = (name) => {
  const client = createClient({ url: redisUrl });

  client.on("connect", () => console.log(`✅ Redis ${name} connected`));
  client.on("error", (err) => {
    console.error(`❌ Redis ${name} error`, err);
  });

  return client;
};

// Main client for general commands (GET/SET/PUBLISH)
const redis = redisDisabled ? createDisabledRedisClient() : createRedisClient("Main");

// Subscriber client specifically for SUB
const subClient = redisDisabled ? createDisabledRedisClient() : createRedisClient("Sub");

if (!redisDisabled) {
  instrumentRedisClient(redis, "main");
  instrumentRedisClient(subClient, "subscriber");
}

const redisConnection = redisDisabled
  ? null
  : {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
      password: process.env.REDIS_PASS,
    };

// Helper to publish events
const publish = async (channel, message) => {
  try {
    await redis.publish(channel, JSON.stringify(message));
  } catch (error) {
    console.error(`❌ Redis Publish Error on channel ${channel}:`, error);
  }
};

// Connect clients unless disabled for tests/offline validation.
if (!redisDisabled) {
  (async () => {
    try {
      if (!redis.isOpen) await redis.connect();
      if (!subClient.isOpen) await subClient.connect();
    } catch (error) {
      console.warn("⚠️ Redis connection failed, running with limited functionality:", error.message);
    }
  })();
}

// ===== CACHE METRICS =====
const metrics = { hits: 0, misses: 0 };

export const recordCacheHit = () => { metrics.hits++; };
export const recordCacheMiss = () => { metrics.misses++; };
export const getCacheMetrics = () => ({
  hits: metrics.hits,
  misses: metrics.misses,
  ratio: metrics.hits + metrics.misses === 0
    ? 0
    : (metrics.hits / (metrics.hits + metrics.misses)).toFixed(4),
});

// Lock configuration
export const LOCK_CONFIG = {
  DEFAULT_TTL: 10000,
  RETRY_MAX: 10,
  RETRY_DELAY: 100,
};

export { redisConnection, subClient, publish };
export default redis;
