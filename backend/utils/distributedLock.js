import crypto from "crypto";
import redis from "../config/redis.js";

const createMockableAsyncFunction = (defaultImpl) => {
  if (process.env.NODE_ENV !== "test") return defaultImpl;

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
    impl = defaultImpl;
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

class DistributedLock {
  constructor() {
    this.acquire = createMockableAsyncFunction(this._acquire.bind(this));
    this.release = createMockableAsyncFunction(this._release.bind(this));
  }

  async _acquire(key, ttl = 10000, maxRetries = 10, minDelay = 100) {
    const identifier = crypto.randomUUID();
    const lockKey = `lock:${key}`;
    let retries = 0;

    while (retries < maxRetries) {
      const result = await redis.set(lockKey, identifier, {
        NX: true,
        PX: ttl,
      });

      if (result === "OK") {
        return identifier;
      }

      retries++;
      const delay = Math.floor(Math.random() * (minDelay * Math.pow(2, retries))) + minDelay;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return null;
  }

  async _release(key, identifier) {
    const lockKey = `lock:${key}`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await redis.eval(script, {
      keys: [lockKey],
      arguments: [identifier],
    });

    return result === 1;
  }
}

export default new DistributedLock();
