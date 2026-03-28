import express from "express";
import {
  searchTransactions,
  exportSearchResults,
} from "../controllers/transactionSearchController.js";
import { authenticate } from "../middleware/auth.js";
import { createUserRateLimiter } from "../config/rateLimiting.js";

const router = express.Router();

// 30 searches per minute per user — enforced in service too, but guard at route layer as well
const searchLimiter = createUserRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  type: "txn-search",
  message: "Search rate limit exceeded. Maximum 30 searches per minute.",
});

/**
 * GET /api/transactions/search
 *
 * Query parameters:
 *   q          - Full-text search string
 *   status     - completed | pending | failed
 *   type       - credit | debit | payment | swap
 *   chain      - XLM | BASE | LSK | FLOW | U2U
 *   token      - XLM | USDC | ETH | LSK | FLOW | U2U
 *   from       - ISO date (start of range)
 *   to         - ISO date (end of range)
 *   minAmount  - Minimum USD value
 *   maxAmount  - Maximum USD value
 *   sortBy     - date | amount | relevance (default: relevance when q provided, date otherwise)
 *   sortDir    - asc | desc (default: desc)
 *   limit      - Page size (default: 20, max: 100)
 *   cursor     - Opaque cursor for next page
 */
router.get("/", authenticate, searchLimiter, searchTransactions);

/**
 * GET /api/transactions/search/export
 *
 * Same filter params as search, no pagination params.
 * Returns a CSV file of all matching results.
 */
router.get("/export", authenticate, searchLimiter, exportSearchResults);

export default router;
