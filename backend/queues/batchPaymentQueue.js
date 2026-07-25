import { Queue } from "bullmq";
import queueConfig from "./index.js";
import attachRedisErrorAlert from "../utils/bullmqAlerts.js";

const batchPaymentQueue = new Queue("batch-payments", queueConfig);
attachRedisErrorAlert(batchPaymentQueue, "batch-payments-queue");

export default batchPaymentQueue;
