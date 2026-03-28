import { Queue } from "bullmq";
import queueConfig from "./index.js";

const batchPaymentQueue = new Queue("batch-payments", queueConfig);

export default batchPaymentQueue;
