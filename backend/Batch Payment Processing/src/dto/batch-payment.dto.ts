import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
} from "class-validator";
import { Type } from "class-transformer";
import { FailureMode } from "../entities/batch-payment.entity";

export class PaymentRequestDto {
  @IsString()
  @IsNotEmpty()
  recipientTag: string;

  @IsNumber()
  @Min(0.0000001)
  amount: number;

  @IsString()
  @IsNotEmpty()
  asset: string;

  @IsString()
  @IsOptional()
  memo?: string;
}

export class CreateBatchPaymentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PaymentRequestDto)
  payments: PaymentRequestDto[];

  @IsEnum(FailureMode)
  failureMode: FailureMode;
}

export class BatchPaymentResultDto {
  index: number;
  status: "success" | "failed";
  transactionId?: number;
  error?: string;
}

export class BatchPaymentResponseDto {
  batchId: number;
  status: string;
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  totalAmount: string;
  totalFees: string;
  results: BatchPaymentResultDto[];
  createdAt: Date;
  completedAt?: Date;
}
