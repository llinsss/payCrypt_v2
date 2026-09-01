import { redisConnection } from "../config/redis.js";
import { buildJobOptions } from "./queueDefaults.js";

const queueConfig = redisConnection ? {
  connection: redisConnection,
  defaultJobOptions: buildJobOptions(),
} : null;

export default queueConfig;
