import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { BatchPayment } from "./batch-payment.entity";

@Entity("payments")
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "user_id" })
  userId: number;

  @Column({ name: "recipient_tag" })
  recipientTag: string;

  @Column({ type: "decimal", precision: 20, scale: 8 })
  amount: string;

  @Column()
  asset: string;

  @Column({ nullable: true })
  memo: string;

  @Column({ default: "pending" })
  status: string;

  @Column({ name: "transaction_id", nullable: true })
  transactionId: string;

  @Column({ name: "batch_payment_id", nullable: true })
  batchPaymentId: number;

  @ManyToOne(() => BatchPayment, { nullable: true })
  @JoinColumn({ name: "batch_payment_id" })
  batchPayment: BatchPayment;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
