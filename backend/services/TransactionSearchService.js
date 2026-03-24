import { stringify } from "csv-stringify/sync";
import db from "../config/database.js";
import redis from "../config/redis.js";
import { getExplorerLink } from "../utils/explorer.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEARCH_CACHE_TTL = 60; // seconds
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const SEARCH_RATE_LIMIT_WINDOW = 60; // seconds
const SEARCH_RATE_LIMIT_MAX = 30; // requests per window per user

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function buildCacheKey(userId, params) {
  return `txn:search:${userId}:${JSON.stringify(params)}`;
}

async function cacheGet(key) {
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key, value, ttl = SEARCH_CACHE_TTL) {
  try {
    await redis.set(key, JSON.stringify(value), { EX: ttl });
  } catch {
    /* silent fail */
  }
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Sliding-window rate limiter backed by Redis sorted sets.
 * Returns true when the request is allowed, false when the limit is exceeded.
 */
async function checkSearchRateLimit(userId) {
  const key = `ratelimit:search:${userId}`;
  const now = Date.now();
  const windowStart = now - SEARCH_RATE_LIMIT_WINDOW * 1000;

  try {
    await redis.zRemRangeByScore(key, 0, windowStart);
    const count = await redis.zCard(key);

    if (count >= SEARCH_RATE_LIMIT_MAX) return false;

    await redis.zAdd(key, { score: now, value: `${now}-${Math.random()}` });
    await redis.expire(key, SEARCH_RATE_LIMIT_WINDOW);
    return true;
  } catch {
    // Redis unavailable — fail open
    return true;
  }
}

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

/**
 * Decode a cursor string into its component parts.
 * Cursor format: base64(JSON { created_at, id })
 */
function decodeCursor(cursor) {
  try {
    return JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Encode a cursor from a transaction row.
 */
function encodeCursor(tx) {
  return Buffer.from(
    JSON.stringify({ created_at: tx.created_at, id: tx.id }),
  ).toString("base64");
}

/**
 * Build a Knex query from the validated search params.
 * Does NOT apply pagination — that is handled separately so we can reuse
 * this for both data fetches and CSV exports.
 */
function buildBaseQuery(userId, params, { forExport = false } = {}) {
  const {
    q,
    status,
    type,
    chain,
    token,
    from,
    to,
    minAmount,
    maxAmount,
    sortBy = "date",
  } = params;

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
      "chains.block_explorer as chain_explorer",
    )
    .leftJoin("users", "transactions.user_id", "users.id")
    .leftJoin("tokens", "transactions.token_id", "tokens.id")
    .leftJoin("chains", "transactions.chain_id", "chains.id")
    .where("transactions.user_id", userId)
    .whereNull("transactions.deleted_at");

  // Full-text search
  if (q && q.trim()) {
    query = query.whereRaw(
      "transactions.search_vector @@ websearch_to_tsquery('simple', ?)",
      [q.trim()],
    );

    if (!forExport && sortBy === "relevance") {
      query = query.select(
        db.raw(
          "ts_rank(transactions.search_vector, websearch_to_tsquery('simple', ?)) as relevance_score",
          [q.trim()],
        ),
      );
    }
  }

  // Filters
  if (status) query = query.where("transactions.status", status);
  if (type) query = query.where("transactions.type", type);
  if (chain) query = query.where("chains.symbol", chain.toUpperCase());
  if (token) query = query.where("tokens.symbol", token.toUpperCase());
  if (from)
    query = query.where("transactions.created_at", ">=", new Date(from));
  if (to) query = query.where("transactions.created_at", "<=", new Date(to));
  if (minAmount != null)
    query = query.where("transactions.usd_value", ">=", minAmount);
  if (maxAmount != null)
    query = query.where("transactions.usd_value", "<=", maxAmount);

  return query;
}

/**
 * Apply sort order to an already-filtered query.
 */
function applySortOrder(query, params) {
  const { q, sortBy = q ? "relevance" : "date", sortDir = "desc" } = params;
  const dir = sortDir === "asc" ? "asc" : "desc";

  switch (sortBy) {
    case "relevance":
      if (q && q.trim()) {
        return query.orderByRaw(
          `ts_rank(transactions.search_vector, websearch_to_tsquery('simple', ?)) DESC`,
          [q.trim()],
        );
      }
      return query.orderBy("transactions.created_at", "desc");

    case "amount":
      return query
        .orderBy("transactions.usd_value", dir)
        .orderBy("transactions.id", "desc");

    case "date":
    default:
      return query
        .orderBy("transactions.created_at", dir)
        .orderBy("transactions.id", "desc");
  }
}

// ---------------------------------------------------------------------------
// TransactionSearchService
// ---------------------------------------------------------------------------

const TransactionSearchService = {
  /**
   * Search transactions with full-text search, filters, and cursor pagination.
   *
   * @param {number|string} userId
   * @param {Object} params
   * @param {string}  [params.q]           - Full-text search query
   * @param {string}  [params.status]      - completed | pending | failed
   * @param {string}  [params.type]        - credit | debit | payment | swap
   * @param {string}  [params.chain]       - XLM | BASE | LSK | FLOW | U2U
   * @param {string}  [params.token]       - XLM | USDC | ETH | etc.
   * @param {string}  [params.from]        - ISO date string
   * @param {string}  [params.to]          - ISO date string
   * @param {number}  [params.minAmount]   - Minimum USD value
   * @param {number}  [params.maxAmount]   - Maximum USD value
   * @param {string}  [params.sortBy]      - date | amount | relevance
   * @param {string}  [params.sortDir]     - asc | desc
   * @param {number}  [params.limit]       - Page size (max 100)
   * @param {string}  [params.cursor]      - Opaque cursor for next page
   * @returns {Promise<{ data, nextCursor, hasMore, total }>}
   */
  async search(userId, params = {}) {
    // Rate limiting
    const allowed = await checkSearchRateLimit(userId);
    if (!allowed) {
      const error = new Error(
        "Search rate limit exceeded. Maximum 30 searches per minute.",
      );
      error.status = 429;
      throw error;
    }

    const limit = Math.min(
      parseInt(params.limit ?? DEFAULT_PAGE_SIZE, 10),
      MAX_PAGE_SIZE,
    );

    // Cache lookup (only for first page — cursored pages vary too much)
    if (!params.cursor) {
      const cacheKey = buildCacheKey(userId, { ...params, limit });
      const cached = await cacheGet(cacheKey);
      if (cached) return { ...cached, fromCache: true };
    }

    let query = buildBaseQuery(userId, params);
    query = applySortOrder(query, params);

    // Cursor-based pagination
    if (params.cursor) {
      const decoded = decodeCursor(params.cursor);
      if (decoded) {
        const { sortBy = params.q ? "relevance" : "date", sortDir = "desc" } =
          params;
        const dir = sortDir === "asc" ? "asc" : "desc";

        if (sortBy === "date" || sortBy === "relevance") {
          if (dir === "desc") {
            query = query.where(function () {
              this.where(
                "transactions.created_at",
                "<",
                new Date(decoded.created_at),
              ).orWhere(function () {
                this.where(
                  "transactions.created_at",
                  "=",
                  new Date(decoded.created_at),
                ).where("transactions.id", "<", decoded.id);
              });
            });
          } else {
            query = query.where(function () {
              this.where(
                "transactions.created_at",
                ">",
                new Date(decoded.created_at),
              ).orWhere(function () {
                this.where(
                  "transactions.created_at",
                  "=",
                  new Date(decoded.created_at),
                ).where("transactions.id", ">", decoded.id);
              });
            });
          }
        }
      }
    }

    // Fetch one extra row to determine if there is a next page
    const rows = await query.limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((tx) => ({
      ...tx,
      explorer_link: getExplorerLink(
        tx.chain_name,
        tx.tx_hash,
        tx.chain_explorer,
      ),
    }));

    const nextCursor = hasMore ? encodeCursor(data[data.length - 1]) : null;

    // Get total count for first page only (expensive for large sets)
    let total = null;
    if (!params.cursor) {
      const countQuery = buildBaseQuery(userId, params);
      const countResult = await countQuery
        .clearSelect()
        .count("transactions.id as total")
        .first();
      total = parseInt(countResult?.total ?? 0, 10);
    }

    const result = { data, nextCursor, hasMore, total };

    // Cache first-page results
    if (!params.cursor) {
      const cacheKey = buildCacheKey(userId, { ...params, limit });
      await cacheSet(cacheKey, result);
    }

    return result;
  },

  /**
   * Export all matching transactions (no pagination) as a CSV buffer.
   *
   * @param {number|string} userId
   * @param {Object} params - Same filter params as search(), excluding cursor/limit/sort
   * @returns {Promise<Buffer>} CSV file content
   */
  async exportToCsv(userId, params = {}) {
    const query = buildBaseQuery(userId, params, { forExport: true });
    const rows = await query
      .orderBy("transactions.created_at", "desc")
      .orderBy("transactions.id", "desc");

    const csvRows = rows.map((tx) => ({
      id: tx.id,
      reference: tx.reference ?? "",
      date: tx.created_at ? new Date(tx.created_at).toISOString() : "",
      type: tx.type ?? "",
      status: tx.status ?? "",
      amount: tx.amount ?? "",
      usd_value: tx.usd_value ?? "",
      token: tx.token_symbol ?? "",
      chain: tx.chain_symbol ?? "",
      from_address: tx.from_address ?? "",
      to_address: tx.to_address ?? "",
      tx_hash: tx.tx_hash ?? "",
      description: tx.description ?? "",
      notes: tx.notes ?? "",
      explorer_link:
        getExplorerLink(tx.chain_name, tx.tx_hash, tx.chain_explorer) ?? "",
    }));

    return stringify(csvRows, { header: true });
  },
};

export default TransactionSearchService;
