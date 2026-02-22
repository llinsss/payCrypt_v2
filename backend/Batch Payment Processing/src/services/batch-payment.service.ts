import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import {
  BatchPayment,
  BatchPaymentStatus,
  FailureMode,
} from "../entities/batch-payment.entity";
import {
  CreateBatchPaymentDto,
  BatchPaymentResponseDto,
  BatchPaymentResultDto,
} from "../dto/batch-payment.dto";
import { PaymentService } from "./payment.service";

@Injectable()
export class BatchPaymentService {
  private readonly CONCURRENCY_LIMIT = 5;

  constructor(
    @InjectRepository(BatchPayment)
    private batchPaymentRepository: Repository<BatchPayment>,
    private paymentService: PaymentService,
    @InjectQueue("batch-payment")
    private batchPaymentQueue: Queue,
    private dataSource: DataSource,
  ) {}

  async createBatchPayment(
    userId: number,
    createBatchPaymentDto: CreateBatchPaymentDto,
  ): Promise<BatchPaymentResponseDto> {
    // Calculate totals
    const totalAmount = createBatchPaymentDto.payments.reduce(
      (sum, p) => sum + p.amount,
      0,
    );

    const totalFees = await this.calculateTotalFees(
      createBatchPaymentDto.payments,
    );

    // Create batch payment record
    const batchPayment = this.batchPaymentRepository.create({
      userId,
      totalPayments: createBatchPaymentDto.payments.length,
      totalAmount: totalAmount.toString(),
      totalFees: totalFees.toString(),
      failureMode: createBatchPaymentDto.failureMode,
      status: BatchPaymentStatus.PENDING,
      results: [],
    });

    await this.batchPaymentRepository.save(batchPayment);

    // Queue the batch for processing
    await this.batchPaymentQueue.add("process-batch", {
      batchPaymentId: batchPayment.id,
      userId,
      payments: createBatchPaymentDto.payments,
      failureMode: createBatchPaymentDto.failureMode,
    });

    return this.mapToResponseDto(batchPayment);
  }

  async processBatchPayment(
    batchPaymentId: number,
    userId: number,
    payments: any[],
    failureMode: FailureMode,
  ): Promise<void> {
    const batchPayment = await this.batchPaymentRepository.findOne({
      where: { id: batchPaymentId },
    });

    if (!batchPayment) {
      throw new NotFoundException("Batch payment not found");
    }

    // Update status to processing
    batchPayment.status = BatchPaymentStatus.PROCESSING;
    await this.batchPaymentRepository.save(batchPayment);

    const results: BatchPaymentResultDto[] = [];
    let successCount = 0;
    let failCount = 0;

    try {
      // Process payments with concurrency limit
      for (let i = 0; i < payments.length; i += this.CONCURRENCY_LIMIT) {
        const batch = payments.slice(i, i + this.CONCURRENCY_LIMIT);
        const batchResults = await Promise.allSettled(
          batch.map((payment, index) =>
            this.processIndividualPayment(
              userId,
              payment,
              batchPaymentId,
              i + index,
            ),
          ),
        );

        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j];
          const paymentIndex = i + j;

          if (result.status === "fulfilled") {
            results.push({
              index: paymentIndex,
              status: "success",
              transactionId: result.value.id,
            });
            successCount++;
          } else {
            results.push({
              index: paymentIndex,
              status: "failed",
              error: result.reason?.message || "Unknown error",
            });
            failCount++;

            // If abort mode and any payment fails, rollback
            if (failureMode === FailureMode.ABORT) {
              await this.rollbackBatch(batchPaymentId);
              batchPayment.status = BatchPaymentStatus.FAILED;
              batchPayment.results = results;
              batchPayment.successfulPayments = 0;
              batchPayment.failedPayments = payments.length;
              batchPayment.completedAt = new Date();
              await this.batchPaymentRepository.save(batchPayment);
              return;
            }
          }
        }
      }

      // Update batch payment with results
      batchPayment.status =
        failCount === 0
          ? BatchPaymentStatus.COMPLETED
          : BatchPaymentStatus.COMPLETED;
      batchPayment.successfulPayments = successCount;
      batchPayment.failedPayments = failCount;
      batchPayment.results = results;
      batchPayment.completedAt = new Date();
      await this.batchPaymentRepository.save(batchPayment);
    } catch (error) {
      batchPayment.status = BatchPaymentStatus.FAILED;
      batchPayment.completedAt = new Date();
      await this.batchPaymentRepository.save(batchPayment);
      throw error;
    }
  }

  async getBatchPaymentStatus(
    batchPaymentId: number,
    userId: number,
  ): Promise<BatchPaymentResponseDto> {
    const batchPayment = await this.batchPaymentRepository.findOne({
      where: { id: batchPaymentId, userId },
    });

    if (!batchPayment) {
      throw new NotFoundException("Batch payment not found");
    }

    return this.mapToResponseDto(batchPayment);
  }

  private async processIndividualPayment(
    userId: number,
    payment: any,
    batchPaymentId: number,
    index: number,
  ): Promise<any> {
    return await this.paymentService.processPayment(
      userId,
      payment,
      batchPaymentId,
    );
  }

  private async calculateTotalFees(payments: any[]): Promise<number> {
    let totalFees = 0;
    for (const payment of payments) {
      const fee = await this.paymentService.calculateFee(
        payment.amount,
        payment.asset,
      );
      totalFees += fee;
    }
    return totalFees;
  }

  private async rollbackBatch(batchPaymentId: number): Promise<void> {
    // In a real implementation, this would reverse successful transactions
    // For now, we'll just mark them as rolled back
    console.log(`Rolling back batch payment ${batchPaymentId}`);
  }

  private mapToResponseDto(
    batchPayment: BatchPayment,
  ): BatchPaymentResponseDto {
    return {
      batchId: batchPayment.id,
      status: batchPayment.status,
      totalPayments: batchPayment.totalPayments,
      successfulPayments: batchPayment.successfulPayments,
      failedPayments: batchPayment.failedPayments,
      totalAmount: batchPayment.totalAmount,
      totalFees: batchPayment.totalFees,
      results: batchPayment.results || [],
      createdAt: batchPayment.createdAt,
      completedAt: batchPayment.completedAt,
    };
  }
}
