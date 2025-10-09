import { createClient } from "redis";
import dotenv from "dotenv";
dotenv.config();

const redis = createClient({
  url: process.env.REDIS_URL,
});

export const redisConnection = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
  password: process.env.REDIS_PASS,
};

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (err) => console.error("❌ Redis error", err));

await redis.connect();

export default redis;
