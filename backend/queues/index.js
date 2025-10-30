import { redisConnection } from "../config/redis.js";

const queueConfig = {
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
};
export default queueConfig;
