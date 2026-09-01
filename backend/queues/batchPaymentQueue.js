import { Queue } from "bullmq";
import queueConfig from "./index.js";
import attachRedisErrorAlert from "../utils/bullmqAlerts.js";
import { attachQueueDepthAlert } from "./queueDefaults.js";

const batchPaymentQueue = queueConfig ? new Queue("batch-payments", queueConfig) : null;
attachRedisErrorAlert(batchPaymentQueue, "batch-payments-queue");
attachQueueDepthAlert(batchPaymentQueue, "batch-payments-queue");

export default batchPaymentQueue;
