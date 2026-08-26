import { Queue } from "bullmq";
import queueConfig from "./index.js";
import attachRedisErrorAlert from "../utils/bullmqAlerts.js";

const batchPaymentQueue = queueConfig ? new Queue("batch-payments", queueConfig) : null;
attachRedisErrorAlert(batchPaymentQueue, "batch-payments-queue");

export default batchPaymentQueue;
