import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Payment } from "../entities/payment.entity";
import { PaymentRequestDto } from "../dto/batch-payment.dto";

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
  ) {}

  async processPayment(
    userId: number,
    paymentRequest: PaymentRequestDto,
    batchPaymentId?: number,
  ): Promise<Payment> {
    // Validate recipient tag
    if (!paymentRequest.recipientTag.startsWith("@")) {
      throw new BadRequestException("Recipient tag must start with @");
    }

    // Simulate balance check
    const hasBalance = await this.checkUserBalance(
      userId,
      paymentRequest.amount,
      paymentRequest.asset,
    );
    if (!hasBalance) {
      throw new BadRequestException("Insufficient funds");
    }

    // Create payment record
    const payment = this.paymentRepository.create({
      userId,
      recipientTag: paymentRequest.recipientTag,
      amount: paymentRequest.amount.toString(),
      asset: paymentRequest.asset,
      memo: paymentRequest.memo,
      status: "processing",
      batchPaymentId,
    });

    await this.paymentRepository.save(payment);

    // Simulate blockchain transaction
    const transactionId = await this.submitToBlockchain(payment);

    payment.transactionId = transactionId;
    payment.status = "completed";

    return await this.paymentRepository.save(payment);
  }

  async calculateFee(amount: number, asset: string): Promise<number> {
    // Simple fee calculation: 0.1% of amount, minimum 0.01
    const fee = Math.max(amount * 0.001, 0.01);
    return fee;
  }

  private async checkUserBalance(
    userId: number,
    amount: number,
    asset: string,
  ): Promise<boolean> {
    // Simulate balance check - in real implementation, check actual balance
    return amount <= 10000; // Mock: allow payments up to 10000
  }

  private async submitToBlockchain(payment: Payment): Promise<string> {
    // Simulate blockchain submission with random delay
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 100 + 50),
    );

    // Simulate occasional failures (5% failure rate)
    if (Math.random() < 0.05) {
      throw new Error("Blockchain submission failed");
    }

    return `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
