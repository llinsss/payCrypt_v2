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
 * @swagger
 * tags:
 *   name: Transaction Search
 *   description: Full-text and filtered search across transaction history
 */

/**
 * @swagger
 * /api/transactions/search:
 *   get:
 *     summary: Search transactions with filters
 *     description: Full-text and filtered search across transaction history. Supports keyword search, status/chain/token filters, amount ranges, and date ranges. Returns cursor-based paginated results.
 *     tags: [Transaction Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Full-text search string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [completed, pending, failed]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [credit, debit, payment, swap]
 *       - in: query
 *         name: chain
 *         schema:
 *           type: string
 *           enum: [XLM, BASE, LSK, FLOW, U2U, STRK]
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (ISO format)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (ISO format)
 *       - in: query
 *         name: minAmount
 *         schema:
 *           type: number
 *         description: Minimum USD value
 *       - in: query
 *         name: maxAmount
 *         schema:
 *           type: number
 *         description: Maximum USD value
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [date, amount, relevance]
 *           default: relevance
 *       - in: query
 *         name: sortDir
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Opaque cursor for next page
 *     responses:
 *       200:
 *         description: Search results with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       type:
 *                         type: string
 *                       status:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       usd_value:
 *                         type: number
 *                       chain:
 *                         type: string
 *                       token:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     next_cursor:
 *                       type: string
 *                     has_more:
 *                       type: boolean
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Search rate limit exceeded (30 per minute)
 */
router.get("/", authenticate, searchLimiter, searchTransactions);

/**
 * @swagger
 * /api/transactions/search/export:
 *   get:
 *     summary: Export search results as CSV
 *     description: Same filter parameters as search, but returns all matching results as a downloadable CSV file instead of paginated JSON.
 *     tags: [Transaction Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [completed, pending, failed]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [credit, debit, payment, swap]
 *       - in: query
 *         name: chain
 *         schema:
 *           type: string
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: minAmount
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxAmount
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Search rate limit exceeded
 */
router.get("/export", authenticate, searchLimiter, exportSearchResults);

export default router;
