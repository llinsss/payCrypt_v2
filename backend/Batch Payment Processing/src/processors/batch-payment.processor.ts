import { Processor, Process } from "@nestjs/bull";
import { Job } from "bull";
import { BatchPaymentService } from "../services/batch-payment.service";
import { Logger } from "@nestjs/common";

@Processor("batch-payment")
export class BatchPaymentProcessor {
  private readonly logger = new Logger(BatchPaymentProcessor.name);

  constructor(private batchPaymentService: BatchPaymentService) {}

  @Process("process-batch")
  async handleBatchPayment(job: Job) {
    this.logger.log(`Processing batch payment job ${job.id}`);

    const { batchPaymentId, userId, payments, failureMode } = job.data;

    try {
      await this.batchPaymentService.processBatchPayment(
        batchPaymentId,
        userId,
        payments,
        failureMode,
      );

      this.logger.log(`Batch payment ${batchPaymentId} completed successfully`);
    } catch (error) {
      this.logger.error(
        `Batch payment ${batchPaymentId} failed: ${error.message}`,
      );
      throw error;
    }
  }
}
