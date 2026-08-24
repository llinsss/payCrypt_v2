import crypto from "crypto";
import redis from "../config/redis.js";

class DistributedLock {
  constructor(redisClient = redis) {
    this.redis = redisClient;
  }

  async acquire(key, ttl = 10000, maxRetries = 10, minDelay = 100) {
    const identifier = crypto.randomUUID();
    const lockKey = `lock:${key}`;
    let retries = 0;

    while (retries < maxRetries) {
      const result = await this.redis.set(lockKey, identifier, {
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

  async release(key, identifier) {
    const lockKey = `lock:${key}`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(script, {
      keys: [lockKey],
      arguments: [identifier],
    });

    return result === 1;
  }
}

export default new DistributedLock();
