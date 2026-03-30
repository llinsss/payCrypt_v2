import { Worker } from "bullmq";
import queueConfig from "../queues/index.js";
import BatchPaymentService from "../services/BatchPaymentService.js";

const batchPaymentWorker = new Worker(
    "batch-payments",
    async (job) => {
        const { userId, senderTag, payments, atomic, asset, assetIssuer, memo, batchId } = job.data;

        console.log(`Processing background batch payment ${batchId} (Job ${job.id})`);

        try {
            // Internal method to process without re-creating the batch record
            await BatchPaymentService.processQueuedBatch({
                batchId,
                userId,
                senderTag,
                payments,
                atomic,
                asset,
                assetIssuer,
                memo,
            });
        } catch (error) {
            console.error(`Error in batch payment worker for batch ${batchId}:`, error);
            throw error;
        }
    },
    queueConfig
);

batchPaymentWorker.on("completed", (job) => {
    console.log(`Batch payment job ${job.id} completed`);
});

batchPaymentWorker.on("failed", (job, err) => {
    console.error(`Batch payment job ${job.id} failed:`, err);
});

export default batchPaymentWorker;
