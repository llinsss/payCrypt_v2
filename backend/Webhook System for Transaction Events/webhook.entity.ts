import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Check,
} from 'typeorm';

export type WebhookEvent =
  | 'transaction.created'
  | 'transaction.completed'
  | 'transaction.failed';

export type DeliveryStatus = 'pending' | 'success' | 'failed' | 'retrying';

@Entity('webhooks')
@Check(`"url" ~* '^https?://'`)
export class Webhook {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  @Index()
  userId: number;

  @Column({ length: 500 })
  url: string;

  @Column({ length: 64 })
  secret: string;

  @Column({ type: 'text', array: true, default: '{}' })
  events: WebhookEvent[];

  @Column({ default: true })
  @Index({ where: '"active" = true' })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => WebhookDelivery, (delivery) => delivery.webhook)
  deliveries: WebhookDelivery[];
}

@Entity('webhook_deliveries')
export class WebhookDelivery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'webhook_id' })
  @Index()
  webhookId: number;

  @ManyToOne(() => Webhook, (webhook) => webhook.deliveries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'webhook_id' })
  webhook: Webhook;

  @Column({ name: 'event_type', length: 50 })
  eventType: WebhookEvent;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @Column({ length: 20, default: 'pending' })
  @Index()
  status: DeliveryStatus;

  @Column({ name: 'response_code', nullable: true, type: 'int' })
  responseCode: number | null;

  @Column({ name: 'response_body', nullable: true, type: 'text' })
  responseBody: string | null;

  @Column({ default: 0 })
  attempts: number;

  @Column({ name: 'last_attempt_at', nullable: true, type: 'timestamp' })
  lastAttemptAt: Date | null;

  @Column({ name: 'next_retry_at', nullable: true, type: 'timestamp' })
  @Index({ where: `"status" = 'retrying'` })
  nextRetryAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
