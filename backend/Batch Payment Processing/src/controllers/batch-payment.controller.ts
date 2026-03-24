import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { BatchPaymentService } from "../services/batch-payment.service";
import {
  CreateBatchPaymentDto,
  BatchPaymentResponseDto,
} from "../dto/batch-payment.dto";
import { Throttle } from "@nestjs/throttler";

@Controller("api/transactions/batch")
export class BatchPaymentController {
  constructor(private readonly batchPaymentService: BatchPaymentService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 10, ttl: 3600000 } }) // 10 requests per hour
  async createBatchPayment(
    @Body() createBatchPaymentDto: CreateBatchPaymentDto,
    @Request() req: any,
  ): Promise<BatchPaymentResponseDto> {
    // In real implementation, extract userId from authenticated request
    const userId = req.user?.id || 1; // Mock user ID

    return await this.batchPaymentService.createBatchPayment(
      userId,
      createBatchPaymentDto,
    );
  }

  @Get(":id")
  async getBatchPaymentStatus(
    @Param("id") id: string,
    @Request() req: any,
  ): Promise<BatchPaymentResponseDto> {
    // In real implementation, extract userId from authenticated request
    const userId = req.user?.id || 1; // Mock user ID

    return await this.batchPaymentService.getBatchPaymentStatus(
      parseInt(id, 10),
      userId,
    );
  }
}
