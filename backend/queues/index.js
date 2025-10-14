import { redisConnection } from "../config/redis.js";

const queueConfig = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // retry failed jobs up to 3 times
    backoff: {
      type: "exponential",
      delay: 5000, // retry after 5s, then 10s, etc.
    },
    removeOnComplete: 50, // keep only the last 50 completed jobs
    removeOnFail: false, // keep failed jobs for inspection
  },
};
export default queueConfig;
