import db from "../config/database.js";
import WebhookService from "../services/WebhookService.js";

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

  const [id] = await db("transactions").insert({
    ...transactionData,
    metadata: transactionData.metadata || null
  });

  return this.findById(id);
},
  async findById(id) {
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
  },


async getAll(limit = 10, offset = 0, metadataSearch = null) {
  let query = db("transactions")
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
    .leftJoin("chains", "transactions.chain_id", "chains.id");

  if (metadataSearch) {
    query = query.whereRaw(
      "transactions.metadata::text ILIKE ?",
      [`%${metadataSearch}%`]
    );
  }

  return await query
    .limit(limit)
    .offset(offset)
    .orderBy("transactions.created_at", "desc");
},

  async getAll(limit = 10, offset = 0, options = {}) {
    const { minAmount = null, maxAmount = null } = options;
    
    let query = db("transactions")
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
      .leftJoin("chains", "transactions.chain_id", "chains.id");

    if (minAmount !== null) {
      query = query.where("transactions.usd_value", ">=", minAmount);
    }

    if (maxAmount !== null) {
      query = query.where("transactions.usd_value", "<=", maxAmount);
    }

    return await query
      .limit(limit)
      .offset(offset)
      .orderBy("transactions.created_at", "desc");
  },


  async getByUser(userId, limit = 10, offset = 0, options = {}) {
    const { minAmount = null, maxAmount = null } = options;
    
    let query = db("transactions")
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
      .where("transactions.user_id", userId);

    if (minAmount !== null) {
      query = query.where("transactions.usd_value", ">=", minAmount);
    }

    if (maxAmount !== null) {
      query = query.where("transactions.usd_value", "<=", maxAmount);
    }

    return await query
      .limit(limit)
      .offset(offset)
      .orderBy("transactions.created_at", "desc");
  },

  async totalDeposit() {
    return await db("transactions")
      .where("status", "completed")
      .where("type", "credit")
      .sum("usd_value as amount");
  },

  async totalDepositByUser(userId) {
    return await db("transactions")
      .where("status", "completed")
      .where("type", "credit")
      .where("user_id", userId)
      .sum("usd_value as amount");
  },
  async totalWithdrawal() {
    return await db("transactions")
      .where("status", "completed")
      .where("type", "debit")
      .sum("usd_value as amount");
  },

  async totalWithdrawalByUser(userId) {
    return await db("transactions")
      .where("user_id", userId)
      .where("status", "completed")
      .where("type", "debit")
      .sum("usd_value as amount");
  },

  async update(id, transactionData, trx = null) {

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

  await query("transactions")
    .where({ id })
    .update({
      ...transactionData,
      updated_at: db.fn.now(),
    });

  return this.findById(id);
},

    const oldTransaction = await this.findById(id);
    const query = trx || db;
    
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
    return await db("transactions").where({ id }).del();
  },


async getByTag(userId, options = {}) {
  const {
    limit = 20,
    offset = 0,
    from = null,
    to = null,
    type = null,
    tagId = null,
    sortBy = "created_at",
    sortOrder = "desc",
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
      "chains.symbol as chain_symbol"
    )
    .leftJoin("users", "transactions.user_id", "users.id")
    .leftJoin("tokens", "transactions.token_id", "tokens.id")
    .leftJoin("chains", "transactions.chain_id", "chains.id")
    .where("transactions.user_id", userId);

  // 🔥 Tag filtering (this is what issue requires)
  if (tagId) {
    query = query
      .join("transaction_tags", "transactions.id", "transaction_tags.transaction_id")
      .where("transaction_tags.tag_id", tagId);
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

  const allowedSortFields = ["created_at", "amount", "usd_value", "type", "status"];
  const sanitizedSortBy = allowedSortFields.includes(sortBy) ? sortBy : "created_at";
  const sanitizedSortOrder = sortOrder === "asc" ? "asc" : "desc";

  return await query
    .orderBy(`transactions.${sanitizedSortBy}`, sanitizedSortOrder)
    .limit(limit)
    .offset(offset);
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
        "chains.symbol as chain_symbol"
      )
      .leftJoin("users", "transactions.user_id", "users.id")
      .leftJoin("tokens", "transactions.token_id", "tokens.id")
      .leftJoin("chains", "transactions.chain_id", "chains.id")
      .where("transactions.user_id", userId);

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

    return await query
      .orderBy(`transactions.${sanitizedSortBy}`, sanitizedSortOrder)
      .limit(limit)
      .offset(offset);
  },


  async countByTag(userId, options = {}) {
    const { from = null, to = null, type = null, minAmount = null, maxAmount = null } = options;

    let query = db("transactions")
      .where("transactions.user_id", userId)
      .count("* as total");

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
