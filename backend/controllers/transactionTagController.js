import Tag from "../models/Tag.js";
import TransactionTag from "../models/TransactionTag.js";
import Transaction from "../models/Transaction.js";

/**
 * Create a new tag
 */
export const createTag = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: "Tag name is required" });
    }

    const existing = await Tag.findByName(name.trim(), req.user.id);
    if (existing) {
      return res.status(400).json({ error: "Tag already exists" });
    }

    const tag = await Tag.create(name.trim(), req.user.id);

    res.status(201).json(tag);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get all tags for logged-in user
 */
export const getTags = async (req, res) => {
  try {
    const tags = await Tag.getByUser(req.user.id);
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Autocomplete tags
 */
export const autocompleteTags = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) return res.json([]);

    const tags = await Tag.autocomplete(req.user.id, q);
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Attach tag to transaction
 */
export const attachTagToTransaction = async (req, res) => {
  try {
    const { transactionId, tagId } = req.body;

    if (!transactionId || !tagId) {
      return res.status(400).json({ error: "transactionId and tagId are required" });
    }

    const transaction = await Transaction.findById(transactionId);

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await TransactionTag.attach(transactionId, tagId);

    res.json({ message: "Tag attached successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Remove tag from transaction
 */
export const removeTagFromTransaction = async (req, res) => {
  try {
    const { transactionId, tagId } = req.body;

    if (!transactionId || !tagId) {
      return res.status(400).json({ error: "transactionId and tagId are required" });
    }

    await TransactionTag.detach(transactionId, tagId);

    res.json({ message: "Tag removed successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get transactions filtered by tag
 */
export const getTransactionsByTag = async (req, res) => {
  try {
    const { tagId } = req.params;

    if (!tagId) {
      return res.status(400).json({ error: "Tag ID is required" });
    }

    const transactions = await Transaction.getAll(
      20,
      0,
      null,
      tagId
    );

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};