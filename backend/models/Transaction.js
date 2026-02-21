import db from "../config/database.js";
import WebhookService from "../services/WebhookService.js";
import { getExplorerLink } from "../utils/explorer.js";
import redis, { recordCacheHit, recordCacheMiss } from "../config/redis.js";


const TTL_TRANSACTION = 5 * 60;  
const TTL_USER_LIST = 2 * 60;  

const CacheKeys = {
  byId: (id) => `txn:id:${id}`,
  byUser: (userId, limit, offset, options) =>
    `txn:user:${userId}:${limit}:${offset}:${JSON.stringify(options)}`,
  byUserPrefix: (userId) => `txn:user:${userId}:*`,
};


const cacheGet = async (key) => {
  try {
    const val = await redis.get(key);
    if (val) { recordCacheHit(); return JSON.parse(val); }
    recordCacheMiss();
    return null;
  } catch { return null; }
};


const cacheSet = async (key, value, ttl) => {
  try {
    await redis.set(key, JSON.stringify(value), { EX: ttl });
  } catch { /* silent fail */ }
};


const cacheDel = async (key) => {
  try { await redis.del(key); } catch { /* silent fail */ }
};
const invalidateUserLists = async (userId) => {
  try {
    const pattern = CacheKeys.byUserPrefix(userId);
    let cursor = 0;
    do {
      const reply = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor;
      if (reply.keys.length) await redis.del(reply.keys);
    } while (cursor !== 0);
  } catch { /* silent fail */ }
};

const Transaction = {
  async create(transactionData) {
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

    // Validate notes if provided
    if (transactionData.notes !== undefined && transactionData.notes !== null) {
      if (typeof transactionData.notes !== "string") {
        throw new Error("Notes must be a string");
      }
      if (transactionData.notes.length > 1000) {
        throw new Error("Notes must be at most 1000 characters");
      }
    }

    const [id] = await db("transactions").insert({
      ...transactionData,
      metadata: transactionData.metadata || null
    });

    // Invalidate user's list cache since there's a new transaction
    if (transactionData.user_id) {
      await invalidateUserLists(transactionData.user_id);
    }

    return this.findById(id);
  },

  async findById(id) {
    const cacheKey = CacheKeys.byId(id);
    const cached = await cacheGet(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return cached;
    }
    console.log(`[Cache MISS] ${cacheKey}`);

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

    if (transaction) {
      transaction.explorer_link = getExplorerLink(
        transaction.chain_name, transaction.tx_hash, transaction.chain_explorer
      );
      await cacheSet(cacheKey, transaction, TTL_TRANSACTION);
    }
    return transaction;
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

    const cacheKey = CacheKeys.byUser(userId, limit, offset, options);
    const cached = await cacheGet(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return cached;
    }
    console.log(`[Cache MISS] ${cacheKey}`);

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

    const result = transactions.map((tx) => ({
      ...tx,
      explorer_link: getExplorerLink(tx.chain_name, tx.tx_hash, tx.chain_explorer),
    }));

    await cacheSet(cacheKey, result, TTL_USER_LIST);
    return result;
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

    // Invalidate caches after update
    await cacheDel(CacheKeys.byId(id));
    if (updatedTransaction?.user_id) await invalidateUserLists(updatedTransaction.user_id);

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
    // Fetch first to get user_id for list invalidation before deleting
    const tx = await this.findById(id);
    const result = await db("transactions")
      .where({ id })
      .update({ deleted_at: db.fn.now() });

    // Invalidate caches
    await cacheDel(CacheKeys.byId(id));
    if (tx?.user_id) await invalidateUserLists(tx.user_id);

    return result;
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
