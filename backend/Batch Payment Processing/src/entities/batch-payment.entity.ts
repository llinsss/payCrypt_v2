import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export enum BatchPaymentStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

export enum FailureMode {
  ABORT = "abort",
  CONTINUE = "continue",
}

@Entity("batch_payments")
@Index(["userId"])
@Index(["status"])
export class BatchPayment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "user_id" })
  userId: number;

  @Column({ name: "total_payments" })
  totalPayments: number;

  @Column({ name: "successful_payments", default: 0 })
  successfulPayments: number;

  @Column({ name: "failed_payments", default: 0 })
  failedPayments: number;

  @Column({ type: "decimal", precision: 20, scale: 8, name: "total_amount" })
  totalAmount: string;

  @Column({ type: "decimal", precision: 20, scale: 8, name: "total_fees" })
  totalFees: string;

  @Column({
    type: "enum",
    enum: BatchPaymentStatus,
    default: BatchPaymentStatus.PENDING,
  })
  status: BatchPaymentStatus;

  @Column({ type: "enum", enum: FailureMode, name: "failure_mode" })
  failureMode: FailureMode;

  @Column({ type: "jsonb", nullable: true })
  results: any[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "completed_at", nullable: true })
  completedAt: Date;
}
