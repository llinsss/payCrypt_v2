import axios from 'axios';
import { randomUUID } from 'crypto';
import db from '../config/database.js';
import User from '../models/User.js';

const VTPASS_API = process.env.VTPASS_API_URL || 'https://api-sandbox.vtpass.com/api';
const VTPASS_USERNAME = process.env.VTPASS_USERNAME;
const VTPASS_PASSWORD = process.env.VTPASS_PASSWORD;
const PROVIDER_TIMEOUT_MS = Number(process.env.BILL_PROVIDER_TIMEOUT_MS) || 30_000;
const RECONCILE_AFTER_MS = Number(process.env.BILL_RECONCILE_AFTER_MS) || 5 * 60 * 1000;

// VTPass codes that mean the purchase was definitively not fulfilled.
const VTPASS_FAILED_CODES = new Set(['010', '011', '012', '013', '016', '017', '018', '040']);

export const BILL_PAYMENT_DECLINED = 'Bill payment was declined by the provider';

/** Maps a VTPass response to 'completed' | 'failed' | 'pending' (unknown outcome). */
export function mapVtpassStatus(body) {
    const status = body?.content?.transactions?.status;
    if (body?.code === '000' && status === 'delivered') return 'completed';
    if (VTPASS_FAILED_CODES.has(body?.code) || status === 'failed' || status === 'reversed') return 'failed';
    return 'pending';
}

const vtpassClient = {
    async request(endpoint, payload) {
        const { data } = await axios.post(`${VTPASS_API}/${endpoint}`, payload, {
            auth: { username: VTPASS_USERNAME, password: VTPASS_PASSWORD },
            timeout: PROVIDER_TIMEOUT_MS,
        });
        return mapVtpassStatus(data);
    },

    pay({ reference, provider, phone, amount }) {
        return this.request('pay', { request_id: reference, serviceID: provider, billersCode: phone, phone, amount });
    },

    requery(reference) {
        return this.request('requery', { request_id: reference });
    },
};

class BillPaymentService {
    constructor(providerClient = vtpassClient) {
        this.providerClient = providerClient;
    }

    /**
     * Get available bill categories
     * @returns {Promise<Array>} Categories: airtime, data, electricity, cable_tv, etc.
     */
    async getCategories() {
        return [
            { id: 'airtime', name: 'Airtime', icon: 'phone' },
            { id: 'data', name: 'Data Bundles', icon: 'wifi' },
            { id: 'electricity', name: 'Electricity', icon: 'flash' },
            { id: 'cable_tv', name: 'Cable TV', icon: 'tv' }
        ];
    }

    /**
     * Get providers for a specific category
     * @param {string} category - e.g., 'airtime', 'data', 'electricity'
     * @returns {Promise<Array>} List of providers
     */
    async getProvidersForCategory(category) {
        const providers = {
            airtime: [
                { id: 'mtn', name: 'MTN', icon: 'mtn' },
                { id: 'airtel', name: 'Airtel', icon: 'airtel' },
                { id: 'glo', name: 'GLO', icon: 'glo' },
                { id: '9mobile', name: '9Mobile', icon: '9mobile' }
            ],
            data: [
                { id: 'mtn', name: 'MTN', icon: 'mtn' },
                { id: 'airtel', name: 'Airtel', icon: 'airtel' },
                { id: 'glo', name: 'GLO', icon: 'glo' },
                { id: '9mobile', name: '9Mobile', icon: '9mobile' },
                { id: 'spectranet', name: 'Spectranet', icon: 'spectranet' }
            ],
            electricity: [
                { id: 'aedc', name: 'AEDC', icon: 'power' },
                { id: 'eedc', name: 'EEDC', icon: 'power' },
                { id: 'ibedc', name: 'IBEDC', icon: 'power' },
                { id: 'kedco', name: 'KEDCO', icon: 'power' }
            ],
            cable_tv: [
                { id: 'dstv', name: 'DSTV', icon: 'tv' },
                { id: 'gotv', name: 'GOTV', icon: 'tv' },
                { id: 'startimes', name: 'Startimes', icon: 'tv' }
            ]
        };

        return providers[category] || [];
    }

    /**
     * Process bill payment
     * @param {Object} paymentData
     * @param {string} paymentData.userId - User ID
     * @param {string} paymentData.category - Bill category
     * @param {string} paymentData.provider - Provider ID
     * @param {string} paymentData.phone - Phone/account number
     * @param {number} paymentData.amount - Amount in NGN
     * @param {string} paymentData.recipient - Optional recipient tag/name
     * @returns {Promise<Object>} Transaction record
     */
    async processBillPayment(paymentData) {
        const { userId, category, provider, phone, amount, recipient } = paymentData;

        // Validate input
        if (!userId || !category || !provider || !phone || !amount) {
            throw new Error('Missing required payment parameters');
        }

        if (amount <= 0) {
            throw new Error('Amount must be greater than 0');
        }

        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // 1. Reserve funds and persist a pending intent, then commit so no
        //    locks are held while the provider is called.
        const payment = await this.createPendingPayment({ userId, category, provider, phone, amount, recipient });

        // 2. Call the provider outside any transaction. Errors and timeouts are
        //    ambiguous (the provider may still have fulfilled the order), so they
        //    leave the payment pending for reconcilePendingPayments().
        const outcome = await this.providerClient
            .pay({ reference: payment.reference, category, provider, phone, amount })
            .catch(() => 'pending');

        // 3. Finalize idempotently.
        const transaction = await this.finalizePayment(payment.reference, outcome);
        if (transaction.status === 'failed') {
            throw new Error(BILL_PAYMENT_DECLINED);
        }

        return {
            success: true,
            status: transaction.status,
            transactionId: transaction.id,
            message: transaction.status === 'completed'
                ? `Bill payment of ₦${amount} processed successfully`
                : `Bill payment of ₦${amount} is processing`,
            data: transaction
        };
    }

    async createPendingPayment({ userId, category, provider, phone, amount, recipient }) {
        const reference = `BILL-${randomUUID()}`;

        return db.transaction(async (trx) => {
            const balance = await trx('balances').where({ user_id: userId }).forUpdate().first();
            if (!balance || Number(balance.ngn_balance) < amount) {
                throw new Error('Insufficient wallet balance');
            }

            await trx('balances').where({ user_id: userId }).decrement('ngn_balance', amount);

            const [transaction] = await trx('transactions')
                .insert({
                    user_id: userId,
                    type: 'bill_payment',
                    amount,
                    currency: 'NGN',
                    status: 'pending',
                    reference,
                    description: `${provider.toUpperCase()} - ${category}`,
                    metadata: { category, provider, phone, recipient, reference },
                    notes: `Bill payment for ${provider}`
                })
                .returning('*');
            return transaction;
        });
    }

    /**
     * Moves a pending bill payment to its final state exactly once. A failed
     * payment refunds the reserved amount (compensation); payments that are
     * already final, or outcomes still pending, are returned unchanged.
     */
    async finalizePayment(reference, outcome) {
        return db.transaction(async (trx) => {
            const transaction = await trx('transactions')
                .where({ reference, type: 'bill_payment' })
                .forUpdate()
                .first();
            if (!transaction) {
                throw new Error('Bill payment not found');
            }
            if (transaction.status !== 'pending' || outcome === 'pending') {
                return transaction;
            }

            if (outcome === 'failed') {
                await trx('balances')
                    .where({ user_id: transaction.user_id })
                    .increment('ngn_balance', transaction.amount);
            }

            const [updated] = await trx('transactions')
                .where({ id: transaction.id })
                .update({ status: outcome, updated_at: trx.fn.now() })
                .returning('*');
            return updated;
        });
    }

    /**
     * Recovers payments left pending by provider timeouts or a crash between
     * the commit and finalization by re-querying the provider.
     */
    async reconcilePendingPayments({ olderThanMs = RECONCILE_AFTER_MS } = {}) {
        const pending = await db('transactions')
            .where({ type: 'bill_payment', status: 'pending' })
            .where('created_at', '<', new Date(Date.now() - olderThanMs))
            .select('reference');

        const results = { total: pending.length, completed: 0, failed: 0, pending: 0 };
        for (const { reference } of pending) {
            const outcome = await this.providerClient.requery(reference).catch(() => 'pending');
            const { status } = await this.finalizePayment(reference, outcome);
            results[status] = (results[status] || 0) + 1;
        }
        return results;
    }

    /**
     * Verify bill payment provider (placeholder for VTPass integration)
     * In production, this would call VTPass API
     */
    async verifyProvider(provider, phone, category) {
        // For now, just validate format
        // In production: const response = await axios.post(`${VTPASS_API}/service-variations`, ...)
        if (!phone || phone.length < 10) {
            throw new Error('Invalid phone/account number');
        }
        return { valid: true, status: 'verified' };
    }
}

export { BillPaymentService };
export default new BillPaymentService();
