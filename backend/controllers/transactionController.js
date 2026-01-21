import Transaction from "../models/Transaction.js";
import User from "../models/User.js";

export const createTransaction = async (req, res) => {
  try {
    const transactionData = {
      ...req.body,
      user_id: req.user.id,
    };

    const transaction = await Transaction.create(transactionData);
    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const transactions = await Transaction.getAll(
      Number.parseInt(limit),
      Number.parseInt(offset)
    );
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTransactionByUser = async (req, res) => {
  try {
    const { id } = req.user;
    const transactions = await Transaction.getByUser(id);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findById(id);

    if (!transaction) {
      return res.status(400).json({ error: "Transaction not found" });
    }
    // Only allow ttransaction owner to view
    if (transaction.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findById(id);

    if (!transaction) {
      return res.status(400).json({ error: "Transaction not found" });
    }

    // Only allow transaction owner to update
    if (transaction.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const updatedTransaction = await Transaction.update(id, req.body);
    res.json(updatedTransaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findById(id);

    if (!transaction) {
      return res.status(400).json({ error: "Transaction not found" });
    }

    // Only allow transaction owner to delete
    if (transaction.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await Transaction.delete(id);
    res.json({ message: "Transaction deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTransactionsByTag = async (req, res) => {
  try {
    const { tag } = req.params;
    const {
      limit = 20,
      offset = 0,
      from,
      to,
      type,
      sortBy = "created_at",
      sortOrder = "desc",
    } = req.query;

    const user = await User.findByTag(tag);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const parsedLimit = Math.min(Math.max(Number.parseInt(limit) || 20, 1), 100);
    const parsedOffset = Math.max(Number.parseInt(offset) || 0, 0);

    const options = {
      limit: parsedLimit,
      offset: parsedOffset,
      from: from || null,
      to: to || null,
      type: type || null,
      sortBy,
      sortOrder,
    };

    const [transactions, total] = await Promise.all([
      Transaction.getByTag(user.id, options),
      Transaction.countByTag(user.id, options),
    ]);

    res.json({
      data: transactions,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: parsedOffset + transactions.length < total,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
