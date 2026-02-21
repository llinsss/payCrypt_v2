import { createClient } from "redis";
import dotenv from "dotenv";
dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const createRedisClient = (name) => {
  const client = createClient({ url: redisUrl });
  
  client.on("connect", () => console.log(`✅ Redis ${name} connected`));
  client.on("error", (err) => {
    console.error(`❌ Redis ${name} error`, err);
  });

  return client;
};

// Main client for general commands (GET/SET/PUBLISH)
const redis = createRedisClient("Main");

// Subscriber client specifically for SUB
const subClient = createRedisClient("Sub");

const redisConnection = {
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

// Connect clients
(async () => {
  try {
    if (!redis.isOpen) await redis.connect();
    if (!subClient.isOpen) await subClient.connect();
  } catch (error) {
    console.warn("⚠️ Redis connection failed, running with limited functionality:", error.message);
  }
})();

export { redisConnection, subClient, publish };
export default redis;
