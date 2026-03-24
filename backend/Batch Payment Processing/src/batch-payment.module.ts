import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bull";
import { BatchPaymentController } from "./controllers/batch-payment.controller";
import { BatchPaymentService } from "./services/batch-payment.service";
import { PaymentService } from "./services/payment.service";
import { BatchPaymentProcessor } from "./processors/batch-payment.processor";
import { BatchPayment } from "./entities/batch-payment.entity";
import { Payment } from "./entities/payment.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([BatchPayment, Payment]),
    BullModule.registerQueue({
      name: "batch-payment",
    }),
  ],
  controllers: [BatchPaymentController],
  providers: [BatchPaymentService, PaymentService, BatchPaymentProcessor],
  exports: [BatchPaymentService, PaymentService],
})
export class BatchPaymentModule {}
