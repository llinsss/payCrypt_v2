export enum WebhookEventType {
    PAYMENT_RECEIVED = 'payment.received',
    PAYMENT_SENT = 'payment.sent',
    ACCOUNT_CREATED = 'account.created',
    BALANCE_UPDATE = 'balance.update',
}

export interface WebhookEventPayload {
    eventType: WebhookEventType;
    timestamp: Date;
    data: Record<string, any>;
}

export interface AccountCreatedPayload {
    accountTag: string;
    publicKey: string;
    balance: string;
    createdAt: Date;
}

export interface PaymentReceivedPayload {
    accountTag: string;
    from: string;
    amount: string;
    asset: string;
    transactionHash: string;
}

export interface PaymentSentPayload {
    accountTag: string;
    to: string;
    amount: string;
    asset: string;
    transactionHash: string;
}

export interface BalanceUpdatePayload {
    accountTag: string;
    previousBalance: string;
    newBalance: string;
    timestamp: Date;
}
