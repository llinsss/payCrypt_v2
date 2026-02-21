import db from "../config/database.js";
import redis from "../config/redis.js";

// Cache TTL in seconds
const CACHE_TTL = {
  BALANCE_BY_ID: 300, // 5 minutes
  BALANCE_BY_USER: 60, // 1 minute
  BALANCE_BY_USER_TOKEN: 300, // 5 minutes
  TOTAL_BALANCE: 120, // 2 minutes
};

// Helper to generate cache keys
const cacheKeys = {
  balanceById: (id) => `balance:id:${id}`,
  balanceByUser: (userId) => `balance:user:${userId}`,
  balanceByUserToken: (userId, tokenId) => `balance:user:${userId}:token:${tokenId}`,
  totalBalance: () => `balance:total`,
  totalBalanceByUser: (userId) => `balance:total:user:${userId}`,
};

// Helper to invalidate user-related caches
const invalidateUserCache = async (userId) => {
  try {
    await Promise.all([
      redis.del(cacheKeys.balanceByUser(userId)),
      redis.del(cacheKeys.totalBalanceByUser(userId)),
      redis.del(cacheKeys.totalBalance()),
    ]);
  } catch (error) {
    console.warn("Cache invalidation failed:", error.message);
  }
};

const Balance = {
  async create(balanceData) {
    const [id] = await db("balances").insert(balanceData);
    
    // Invalidate cache for the user
    if (balanceData.user_id) {
      await invalidateUserCache(balanceData.user_id);
    }
    
    return this.findById(id);
  },

  async findById(id) {
    // Try cache first
    const cacheKey = cacheKeys.balanceById(id);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn("Cache read failed:", error.message);
    }

    // Optimized query with explicit column selection
    const balance = await db("balances")
      .select(
        "balances.id",
        "balances.user_id",
        "balances.token_id",
        "balances.amount",
        "balances.usd_value",
        "balances.address",
        "balances.auto_convert_threshold",
        "balances.created_at",
        "balances.updated_at",
        "users.email as user_email",
        "users.tag as user_tag",
        "tokens.name as token_name",
        "tokens.symbol as token_symbol",
        "tokens.logo_url as token_logo_url",
        "tokens.price as token_price"
      )
      .leftJoin("users", "balances.user_id", "users.id")
      .leftJoin("tokens", "balances.token_id", "tokens.id")
      .where("balances.id", id)
      .first();

    // Cache the result
    if (balance) {
      try {
        await redis.set(cacheKey, JSON.stringify(balance), "EX", CACHE_TTL.BALANCE_BY_ID);
      } catch (error) {
        console.warn("Cache write failed:", error.message);
      }
    }

    return balance;
  },

  async findByAddress(address) {
    return await db("balances").where({ address }).first();
  },

  async findByUserIdAndTokenId(user_id, token_id) {
    // Try cache first
    const cacheKey = cacheKeys.balanceByUserToken(user_id, token_id);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn("Cache read failed:", error.message);
    }

    // Use composite index for faster lookup
    const balance = await db("balances")
      .where({ user_id, token_id })
      .first();

    // Cache the result
    if (balance) {
      try {
        await redis.set(cacheKey, JSON.stringify(balance), "EX", CACHE_TTL.BALANCE_BY_USER_TOKEN);
      } catch (error) {
        console.warn("Cache write failed:", error.message);
      }
    }

    return balance;
  },

  async getAll(limit = 10, offset = 0) {
    // Optimized query with explicit columns and proper indexing
    return await db("balances")
      .select(
        "balances.id",
        "balances.user_id",
        "balances.token_id",
        "balances.amount",
        "balances.usd_value",
        "balances.address",
        "balances.auto_convert_threshold",
        "balances.created_at",
        "balances.updated_at",
        "users.email as user_email",
        "users.tag as user_tag",
        "tokens.name as token_name",
        "tokens.symbol as token_symbol",
        "tokens.logo_url as token_logo_url",
        "tokens.price as token_price"
      )
      .leftJoin("users", "balances.user_id", "users.id")
      .leftJoin("tokens", "balances.token_id", "tokens.id")
      .orderBy("balances.created_at", "desc")
      .limit(limit)
      .offset(offset);
  },
  async findByUserId(userId) {
    // Try cache first
    const cacheKey = cacheKeys.balanceByUser(userId);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn("Cache read failed:", error.message);
    }

    // Optimized query using composite index
    const balances = await db("balances")
      .select(
        "balances.id",
        "balances.user_id",
        "balances.token_id",
        "balances.amount",
        "balances.usd_value",
        "balances.address",
        "balances.auto_convert_threshold",
        "balances.created_at",
        "balances.updated_at",
        "users.email as user_email",
        "users.tag as user_tag",
        "tokens.name as token_name",
        "tokens.symbol as token_symbol",
        "tokens.logo_url as token_logo_url",
        "tokens.price as token_price"
      )
      .leftJoin("users", "balances.user_id", "users.id")
      .leftJoin("tokens", "balances.token_id", "tokens.id")
      .where("balances.user_id", userId);

    // Cache the result
    if (balances) {
      try {
        await redis.set(cacheKey, JSON.stringify(balances), "EX", CACHE_TTL.BALANCE_BY_USER);
      } catch (error) {
        console.warn("Cache write failed:", error.message);
      }
    }

    return balances;
  },
  async getByUser(userId, limit = 10, offset = 0) {
    // Optimized query using composite index for user_id + created_at
    return await db("balances")
      .select(
        "balances.id",
        "balances.user_id",
        "balances.token_id",
        "balances.amount",
        "balances.usd_value",
        "balances.address",
        "balances.auto_convert_threshold",
        "balances.created_at",
        "balances.updated_at",
        "users.email as user_email",
        "users.tag as user_tag",
        "tokens.name as token_name",
        "tokens.symbol as token_symbol",
        "tokens.logo_url as token_logo_url",
        "tokens.price as token_price"
      )
      .leftJoin("users", "balances.user_id", "users.id")
      .leftJoin("tokens", "balances.token_id", "tokens.id")
      .where("balances.user_id", userId)
      .orderBy("balances.created_at", "desc")
      .limit(limit)
      .offset(offset);
  },

  async totalBalance() {
    // Try cache first
    const cacheKey = cacheKeys.totalBalance();
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn("Cache read failed:", error.message);
    }

    const result = await db("balances").sum("usd_value as amount");

    // Cache the result
    if (result) {
      try {
        await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL.TOTAL_BALANCE);
      } catch (error) {
        console.warn("Cache write failed:", error.message);
      }
    }

    return result;
  },

  async totalBalanceByUser(userId) {
    // Try cache first
    const cacheKey = cacheKeys.totalBalanceByUser(userId);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn("Cache read failed:", error.message);
    }

    // Use composite index for user_id + usd_value
    const result = await db("balances")
      .where("user_id", userId)
      .sum("usd_value as amount");

    // Cache the result
    if (result) {
      try {
        await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL.TOTAL_BALANCE);
      } catch (error) {
        console.warn("Cache write failed:", error.message);
      }
    }

    return result;
  },

  async credit(id, amount) {
    await db("balances").where({ id }).increment("amount", amount);
    
    // Invalidate cache
    const balance = await db("balances").where({ id }).first();
    if (balance) {
      await invalidateUserCache(balance.user_id);
      await redis.del(cacheKeys.balanceById(id));
    }
    
    return this.findById(id);
  },

  async debit(id, amount) {
    await db("balances").where({ id }).decrement("amount", amount);
    
    // Invalidate cache
    const balance = await db("balances").where({ id }).first();
    if (balance) {
      await invalidateUserCache(balance.user_id);
      await redis.del(cacheKeys.balanceById(id));
    }
    
    return this.findById(id);
  },

  async update(id, balanceData) {
    await db("balances")
      .where({ id })
      .update({
        ...balanceData,
        updated_at: db.fn.now(),
      });
    
    // Invalidate cache
    const balance = await db("balances").where({ id }).first();
    if (balance) {
      await invalidateUserCache(balance.user_id);
      await redis.del(cacheKeys.balanceById(id));
      if (balance.token_id) {
        await redis.del(cacheKeys.balanceByUserToken(balance.user_id, balance.token_id));
      }
    }
    
    return this.findById(id);
  },

  async delete(id) {
    // Get balance before deletion for cache invalidation
    const balance = await db("balances").where({ id }).first();
    
    const result = await db("balances").where({ id }).del();
    
    // Invalidate cache
    if (balance) {
      await invalidateUserCache(balance.user_id);
      await redis.del(cacheKeys.balanceById(id));
      if (balance.token_id) {
        await redis.del(cacheKeys.balanceByUserToken(balance.user_id, balance.token_id));
      }
    }
    
    return result;
  },
};

export default Balance;
