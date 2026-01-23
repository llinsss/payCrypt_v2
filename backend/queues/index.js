import { redisConnection } from "../config/redis.js";

const queueConfig = redisConnection ? {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: false,
  },
} : null;

export default queueConfig;
