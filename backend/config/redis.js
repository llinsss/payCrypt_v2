import { createClient } from "redis";
import dotenv from "dotenv";
dotenv.config();

let redis = null;
let redisConnection = null;

redis = createClient({
  url: process.env.REDIS_URL,
});

redisConnection = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
  password: process.env.REDIS_PASS,
};

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (err) => {
  console.error("❌ Redis error", err);
  // If Redis fails to connect, disable it
  console.warn("⚠️ Redis not available, running without Redis");
  redis = {
    get: async () => null,
    set: async () => null,
    del: async () => null,
    expire: async () => null,
    exists: async () => false,
    hget: async () => null,
    hset: async () => null,
    hdel: async () => null,
    hgetall: async () => ({}),
    lpush: async () => null,
    rpop: async () => null,
    publish: async () => null,
    subscribe: async () => null,
  };
  redisConnection = null;
});

// Try to connect asynchronously
setTimeout(() => {
  redis.connect().catch((error) => {
    console.warn("⚠️ Redis connection failed, running without Redis:", error.message);
    redis = {
      get: async () => null,
      set: async () => null,
      del: async () => null,
      expire: async () => null,
      exists: async () => false,
      hget: async () => null,
      hset: async () => null,
      hdel: async () => null,
      hgetall: async () => ({}),
      lpush: async () => null,
      rpop: async () => null,
      publish: async () => null,
      subscribe: async () => null,
    };
    redisConnection = null;
  });
}, 100);

export { redisConnection };
export default redis;
