import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { Webhook } from './webhook.entity';

export enum DeliveryStatus {
    PENDING = 'pending',
    SUCCESS = 'success',
    FAILED = 'failed',
}

@Entity('webhook_deliveries')
export class WebhookDelivery {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('uuid')
    @Index()
    webhookId: string;

    @ManyToOne(() => Webhook, (webhook) => webhook.deliveries, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'webhookId' })
    webhook: Webhook;

    @Column()
    eventType: string;

    @Column('jsonb')
    payload: Record<string, any>;

    @Column({
        type: 'enum',
        enum: DeliveryStatus,
        default: DeliveryStatus.PENDING,
    })
    status: DeliveryStatus;

    @Column({ default: 0 })
    attempts: number;

    @Column({ type: 'timestamp', nullable: true })
    lastAttemptAt: Date;

    @Column({ nullable: true })
    responseStatus: number;

    @Column({ type: 'text', nullable: true })
    responseBody: string;

    @CreateDateColumn()
    createdAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    deliveredAt: Date;
}
