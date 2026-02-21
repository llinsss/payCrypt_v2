import db from "../config/database.js";
import Transaction from "../models/Transaction.js";

export const resolvers = {
    Query: {
        me: async (_, __, context) => {
            if (!context.user) {
                throw new Error("Not authenticated");
            }
            return context.user;
        },
        myTransactions: async (_, { limit = 10, offset = 0 }, context) => {
            if (!context.user) {
                throw new Error("Not authenticated");
            }
            return await Transaction.getByUser(context.user.id, limit, offset, {});
        },
        transaction: async (_, { id }, context) => {
            if (!context.user) {
                throw new Error("Not authenticated");
            }
            const tx = await Transaction.findById(id);

            if (!tx) {
                throw new Error("Transaction not found");
            }
            if (tx.user_id !== context.user.id && context.user.role !== 'admin' && context.user.role !== 'superadmin') {
                throw new Error("Not authorized to view this transaction");
            }

            return tx;
        }
    }
};
