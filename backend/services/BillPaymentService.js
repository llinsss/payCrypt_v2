import axios from 'axios';
import db from '../config/database.js';
import Transaction from '../models/Transaction.js';
import Balance from '../models/Balance.js';
import User from '../models/User.js';

const VTPASS_API = process.env.VTPASS_API_URL || 'https://api-sandbox.vtpass.com/api';
const VTPASS_USERNAME = process.env.VTPASS_USERNAME;
const VTPASS_PASSWORD = process.env.VTPASS_PASSWORD;

class BillPaymentService {
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

        // Get user balance
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        const balance = await Balance.getByUserId(userId);
        if (!balance || balance.ngn_balance < amount) {
            throw new Error('Insufficient wallet balance');
        }

        const trx = await db.transaction();

        try {
            // Deduct from wallet
            await trx('balances')
                .where({ user_id: userId })
                .decrement('ngn_balance', amount);

            // Create transaction record
            const transaction = await Transaction.create(
                {
                    user_id: userId,
                    type: 'bill_payment',
                    amount: amount,
                    currency: 'NGN',
                    status: 'completed',
                    description: `${provider.toUpperCase()} - ${category}`,
                    metadata: {
                        category,
                        provider,
                        phone,
                        recipient,
                        reference: `BILL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                    },
                    notes: `Bill payment for ${provider}`
                },
                trx
            );

            await trx.commit();

            return {
                success: true,
                transactionId: transaction.id,
                message: `Bill payment of ₦${amount} processed successfully`,
                data: transaction
            };
        } catch (error) {
            await trx.rollback();
            throw error;
        }
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

export default new BillPaymentService();
