import TransactionSearchService from "../services/TransactionSearchService.js";

const VALID_STATUSES = ["completed", "pending", "failed"];
const VALID_TYPES = ["credit", "debit", "payment", "swap"];
const VALID_SORT_BY = ["date", "amount", "relevance"];
const VALID_SORT_DIR = ["asc", "desc"];

/**
 * Parse and validate search query parameters from the request.
 * Returns sanitized params or throws a 400 error.
 */
function parseParams(query) {
  const errors = [];

  const params = {
    q: typeof query.q === "string" ? query.q.slice(0, 200) : undefined,
    status: query.status,
    type: query.type,
    chain: query.chain,
    token: query.token,
    from: query.from,
    to: query.to,
    minAmount:
      query.minAmount != null ? parseFloat(query.minAmount) : undefined,
    maxAmount:
      query.maxAmount != null ? parseFloat(query.maxAmount) : undefined,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
    limit: query.limit != null ? parseInt(query.limit, 10) : undefined,
    cursor: query.cursor,
  };

  if (params.status && !VALID_STATUSES.includes(params.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(", ")}`);
  }
  if (params.type && !VALID_TYPES.includes(params.type)) {
    errors.push(`type must be one of: ${VALID_TYPES.join(", ")}`);
  }
  if (params.sortBy && !VALID_SORT_BY.includes(params.sortBy)) {
    errors.push(`sortBy must be one of: ${VALID_SORT_BY.join(", ")}`);
  }
  if (params.sortDir && !VALID_SORT_DIR.includes(params.sortDir)) {
    errors.push(`sortDir must be one of: ${VALID_SORT_DIR.join(", ")}`);
  }
  if (params.from && isNaN(Date.parse(params.from))) {
    errors.push("from must be a valid ISO date string");
  }
  if (params.to && isNaN(Date.parse(params.to))) {
    errors.push("to must be a valid ISO date string");
  }
  if (params.minAmount != null && isNaN(params.minAmount)) {
    errors.push("minAmount must be a number");
  }
  if (params.maxAmount != null && isNaN(params.maxAmount)) {
    errors.push("maxAmount must be a number");
  }
  if (
    params.minAmount != null &&
    params.maxAmount != null &&
    params.minAmount > params.maxAmount
  ) {
    errors.push("minAmount cannot be greater than maxAmount");
  }
  if (params.limit != null && (isNaN(params.limit) || params.limit < 1)) {
    errors.push("limit must be a positive integer");
  }

  return { params, errors };
}

export const searchTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { params, errors } = parseParams(req.query);

    if (errors.length) {
      return res
        .status(400)
        .json({ error: "Invalid search parameters", details: errors });
    }

    const result = await TransactionSearchService.search(userId, params);

    return res.json({
      data: result.data,
      pagination: {
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        total: result.total,
        limit: Math.min(params.limit ?? 20, 100),
      },
      fromCache: result.fromCache ?? false,
    });
  } catch (err) {
    if (err.status === 429) {
      return res.status(429).json({ error: err.message });
    }
    console.error("Transaction search error:", err.message);
    return res.status(500).json({ error: "Search failed" });
  }
};

export const exportSearchResults = async (req, res) => {
  try {
    const userId = req.user.id;
    const { params, errors } = parseParams(req.query);

    if (errors.length) {
      return res
        .status(400)
        .json({ error: "Invalid export parameters", details: errors });
    }

    const csv = await TransactionSearchService.exportToCsv(userId, params);
    const filename = `transactions-${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    console.error("Transaction export error:", err.message);
    return res.status(500).json({ error: "Export failed" });
  }
};
