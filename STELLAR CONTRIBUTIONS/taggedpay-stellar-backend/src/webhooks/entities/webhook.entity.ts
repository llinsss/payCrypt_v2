import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    OneToMany,
} from 'typeorm';
import { WebhookDelivery } from './webhook-delivery.entity';

export enum WebhookEventType {
    PAYMENT_RECEIVED = 'payment.received',
    PAYMENT_SENT = 'payment.sent',
    ACCOUNT_CREATED = 'account.created',
    BALANCE_UPDATE = 'balance.update',
}

@Entity('webhooks')
export class Webhook {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    @Index()
    accountTag: string;

    @Column()
    url: string;

    @Column()
    secret: string;

    @Column('simple-array')
    events: WebhookEventType[];

    @Column({ default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => WebhookDelivery, (delivery) => delivery.webhook)
    deliveries: WebhookDelivery[];
}
