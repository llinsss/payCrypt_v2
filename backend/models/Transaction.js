import db from "../config/database.js";
import WebhookService from "../services/WebhookService.js";
import { getExplorerLink } from "../utils/explorer.js";

const Transaction = {
  async create(transactionData, trx = null) {
    // Validate metadata if provided
    if (transactionData.metadata !== undefined) {
      const metadata = transactionData.metadata;

      if (typeof metadata !== "object" || Array.isArray(metadata)) {
        throw new Error("Metadata must be a valid JSON object");
      }

      const size = Buffer.byteLength(JSON.stringify(metadata), "utf8");
      if (size > 2048) {
        throw new Error("Metadata exceeds 2KB limit");
      }
    }

    const query = trx || db;
    const [id] = await query("transactions").insert({
      ...transactionData,
      metadata: transactionData.metadata || null
    });

    return this.findById(id);
  },

  async findByIdempotencyKey(idempotencyKey, trx = null) {
    const query = trx || db;
    return await query("transactions")
      .where({ idempotency_key: idempotencyKey })
      .first();
  },
  async findById(id) {
    const transaction = await db("transactions")
      .select(
        "transactions.*",
        "users.email as user_email",
        "users.tag as user_tag",
        "tokens.name as token_name",
        "tokens.symbol as token_symbol",
        "tokens.logo_url as token_logo_url",
        "chains.name as chain_name",
        "chains.symbol as chain_symbol",
        "chains.block_explorer as chain_explorer"
      )
      .leftJoin("users", "transactions.user_id", "users.id")
      .leftJoin("tokens", "transactions.token_id", "tokens.id")
      .leftJoin("chains", "transactions.chain_id", "chains.id")
      .where("transactions.id", id)
      .where("transactions.deleted_at", null)
      .first();
  },

  async findByIdWithDeleted(id) {
    return await db("transactions")
      .select(
        "transactions.*",
        "users.email as user_email",
        "users.tag as user_tag",
        "tokens.name as token_name",
        "tokens.symbol as token_symbol",
        "tokens.logo_url as token_logo_url",
        "chains.name as chain_name",
        "chains.symbol as chain_symbol"
      )
      .leftJoin("users", "transactions.user_id", "users.id")
      .leftJoin("tokens", "transactions.token_id", "tokens.id")
      .leftJoin("chains", "transactions.chain_id", "chains.id")
      .where("transactions.id", id)
      .first();

    if (transaction) {
      transaction.explorer_link = getExplorerLink(
        transaction.chain_name,
        transaction.tx_hash,
        transaction.chain_explorer
      );
    }
    return transaction;
  },


  async getAll(limit = 10, offset = 0, metadataSearch = null, options = {}) {
    const { minAmount = null, maxAmount = null, noteSearch = null } = options;
    
    let query = db("transactions")
      .select(
        "transactions.*",
        "users.email as user_email",
        "users.tag as user_tag",
        "tokens.name as token_name",
        "tokens.symbol as token_symbol",
        "tokens.logo_url as token_logo_url",
        "chains.name as chain_name",
        "chains.symbol as chain_symbol",
        "chains.block_explorer as chain_explorer"
      )
      .leftJoin("users", "transactions.user_id", "users.id")
      .leftJoin("tokens", "transactions.token_id", "tokens.id")
      .leftJoin("chains", "transactions.chain_id", "chains.id")
      .where("transactions.deleted_at", null);

    if (metadataSearch) {
      query = query.whereRaw(
        "transactions.metadata::text ILIKE ?",
        [`%${metadataSearch}%`]
      );
    }

    if (noteSearch) {
      query = query.where("transactions.notes", "ILIKE", `%${noteSearch}%`);
    }

    if (minAmount !== null) {
      query = query.where("transactions.usd_value", ">=", minAmount);
    }

    if (maxAmount !== null) {
      query = query.where("transactions.usd_value", "<=", maxAmount);
    }

    const transactions = await query
      .limit(limit)
      .offset(offset)
      .orderBy("transactions.created_at", "desc");

    return transactions.map((tx) => ({
      ...tx,
      explorer_link: getExplorerLink(tx.chain_name, tx.tx_hash, tx.chain_explorer),
    }));
  },


  async getByUser(userId, limit = 10, offset = 0, options = {}) {
    const { minAmount = null, maxAmount = null, noteSearch = null } = options;
    
    let query = db("transactions")
      .select(
        "transactions.*",
        "users.email as user_email",
        "users.tag as user_tag",
        "tokens.name as token_name",
        "tokens.symbol as token_symbol",
        "tokens.logo_url as token_logo_url",
        "chains.name as chain_name",
        "chains.symbol as chain_symbol",
        "chains.block_explorer as chain_explorer"
      )
      .leftJoin("users", "transactions.user_id", "users.id")
      .leftJoin("tokens", "transactions.token_id", "tokens.id")
      .leftJoin("chains", "transactions.chain_id", "chains.id")
      .where("transactions.user_id", userId)
      .where("transactions.deleted_at", null);

    if (noteSearch) {
      query = query.where("transactions.notes", "ILIKE", `%${noteSearch}%`);
    }

    if (minAmount !== null) {
      query = query.where("transactions.usd_value", ">=", minAmount);
    }

    if (maxAmount !== null) {
      query = query.where("transactions.usd_value", "<=", maxAmount);
    }

    const transactions = await query
      .limit(limit)
      .offset(offset)
      .orderBy("transactions.created_at", "desc");

    return transactions.map((tx) => ({
      ...tx,
      explorer_link: getExplorerLink(tx.chain_name, tx.tx_hash, tx.chain_explorer),
    }));
  },

  async totalDeposit() {
    return await db("transactions")
      .where("status", "completed")
      .where("type", "credit")
      .where("deleted_at", null)
      .sum("usd_value as amount");
  },

  async totalDepositByUser(userId) {
    return await db("transactions")
      .where("status", "completed")
      .where("type", "credit")
      .where("user_id", userId)
      .where("deleted_at", null)
      .sum("usd_value as amount");
  },
  async totalWithdrawal() {
    return await db("transactions")
      .where("status", "completed")
      .where("type", "debit")
      .where("deleted_at", null)
      .sum("usd_value as amount");
  },

  async totalWithdrawalByUser(userId) {
    return await db("transactions")
      .where("user_id", userId)
      .where("status", "completed")
      .where("type", "debit")
      .where("deleted_at", null)
      .sum("usd_value as amount");
  },

  async update(id, transactionData, trx = null) {
    const oldTransaction = await this.findById(id);
    const query = trx || db;

    if (transactionData.metadata !== undefined) {
      const metadata = transactionData.metadata;

      if (typeof metadata !== "object" || Array.isArray(metadata)) {
        throw new Error("Metadata must be a valid JSON object");
      }

      const size = Buffer.byteLength(JSON.stringify(metadata), "utf8");
      if (size > 2048) {
        throw new Error("Metadata exceeds 2KB limit");
      }
    }

    if (transactionData.notes !== undefined && transactionData.notes !== null) {
      if (typeof transactionData.notes !== "string") {
        throw new Error("Notes must be a string");
      }
      if (transactionData.notes.length > 1000) {
        throw new Error("Notes must be at most 1000 characters");
      }
    }
    
    await query("transactions")
      .where({ id })
      .update({
        ...transactionData,
        updated_at: db.fn.now(),
      });

    const updatedTransaction = await this.findById(id);

    if (transactionData.status && oldTransaction.status !== transactionData.status) {
      WebhookService.sendStatusChangeWebhook(
        updatedTransaction,
        oldTransaction.status,
        transactionData.status
      ).catch(console.error);
    }

    return updatedTransaction;
  },


  async delete(id) {
    return await db("transactions")
      .where({ id })
      .update({ deleted_at: db.fn.now() });
  },

  async restore(id) {
    return await db("transactions")
      .where({ id })
      .update({ deleted_at: null });
  },


  async getByTag(userId, options = {}) {
    const {
      limit = 20,
      offset = 0,
      from = null,
      to = null,
      type = null,
      minAmount = null,
      maxAmount = null,
      sortBy = "created_at",
      sortOrder = "desc",
      noteSearch = null,
    } = options;

    let query = db("transactions")
      .select(
        "transactions.*",
        "users.email as user_email",
        "users.tag as user_tag",
        "tokens.name as token_name",
        "tokens.symbol as token_symbol",
        "tokens.logo_url as token_logo_url",
        "chains.name as chain_name",
        "chains.symbol as chain_symbol",
        "chains.block_explorer as chain_explorer"
      )
      .leftJoin("users", "transactions.user_id", "users.id")
      .leftJoin("tokens", "transactions.token_id", "tokens.id")
      .leftJoin("chains", "transactions.chain_id", "chains.id")
      .where("transactions.user_id", userId)
      .where("transactions.deleted_at", null);

    if (noteSearch) {
      query = query.where("transactions.notes", "ILIKE", `%${noteSearch}%`);
    }

    if (from) {
      query = query.where("transactions.created_at", ">=", from);
    }

    if (to) {
      query = query.where("transactions.created_at", "<=", to);
    }

    if (type) {
      query = query.where("transactions.type", type);
    }

    if (minAmount !== null) {
      query = query.where("transactions.usd_value", ">=", minAmount);
    }

    if (maxAmount !== null) {
      query = query.where("transactions.usd_value", "<=", maxAmount);
    }

    const allowedSortFields = ["created_at", "amount", "usd_value", "type", "status"];
    const sanitizedSortBy = allowedSortFields.includes(sortBy) ? sortBy : "created_at";
    const sanitizedSortOrder = sortOrder === "asc" ? "asc" : "desc";

    const transactions = await query
      .orderBy(`transactions.${sanitizedSortBy}`, sanitizedSortOrder)
      .limit(limit)
      .offset(offset);

    return transactions.map((tx) => ({
      ...tx,
      explorer_link: getExplorerLink(tx.chain_name, tx.tx_hash, tx.chain_explorer),
    }));
  },


  async countByTag(userId, options = {}) {
    const { from = null, to = null, type = null, minAmount = null, maxAmount = null, noteSearch = null } = options;

    let query = db("transactions")
      .where("transactions.user_id", userId)
      .where("transactions.deleted_at", null)
      .count("* as total");

    if (noteSearch) {
      query = query.where("transactions.notes", "ILIKE", `%${noteSearch}%`);
    }

    if (from) {
      query = query.where("transactions.created_at", ">=", from);
    }

    if (to) {
      query = query.where("transactions.created_at", "<=", to);
    }

    if (type) {
      query = query.where("transactions.type", type);
    }

    if (minAmount !== null) {
      query = query.where("transactions.usd_value", ">=", minAmount);
    }

    if (maxAmount !== null) {
      query = query.where("transactions.usd_value", "<=", maxAmount);
    }

    const result = await query.first();
    return result ? result.total : 0;
  },
};

export default Transaction;
