import express from "express";
import redis from "../config/redis.js";
import * as freecryptoapi from "../services/free-crypto-api.js";
import * as exchangerateapi from "../services/exchange-rate-api.js";
import { NGN_KEY, updateNgnRate } from "../config/initials.js";
import * as controller from "../controllers/generalController.js";
import { publicCache } from "../middleware/cacheControl.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: General
 *   description: General utility endpoints — tag registration, balance lookup, transfers, exchange rates, and bill services
 */

/**
 * @swagger
 * /api/upload-file:
 *   post:
 *     summary: Upload a file (KYC document, profile image, etc.)
 *     tags: [General]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File uploaded successfully
 */
router.post("/upload-file", controller.upload_file);

/**
 * @swagger
 * /api/register-tag:
 *   post:
 *     summary: Register a @tag for an address
 *     description: Register a unique @tag and associate it with a blockchain wallet address.
 *     tags: [General]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tag
 *               - address
 *             properties:
 *               tag:
 *                 type: string
 *                 example: "john_lagos"
 *               address:
 *                 type: string
 *                 example: "0x1234567890abcdef"
 *               chain:
 *                 type: string
 *                 example: "base"
 *     responses:
 *       200:
 *         description: Tag registered
 */
router.post("/register-tag", controller.register_tag);

/**
 * @swagger
 * /api/get-tag-address:
 *   post:
 *     summary: Resolve a @tag to its wallet address
 *     tags: [General]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tag
 *             properties:
 *               tag:
 *                 type: string
 *                 example: "alice"
 *     responses:
 *       200:
 *         description: Tag address resolved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 address:
 *                   type: string
 *                 chain:
 *                   type: string
 */
router.post("/get-tag-address", controller.get_tag_address);

/**
 * @swagger
 * /api/get-tag-balance:
 *   post:
 *     summary: Get balance for a @tag
 *     tags: [General]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tag
 *             properties:
 *               tag:
 *                 type: string
 *                 example: "alice"
 *     responses:
 *       200:
 *         description: Tag balance
 */
router.post("/get-tag-balance", controller.get_tag_balance);

/**
 * @swagger
 * /api/send-to-tag:
 *   post:
 *     summary: Send funds to a @tag
 *     tags: [General]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sender_tag
 *               - receiver_tag
 *               - amount
 *             properties:
 *               sender_tag:
 *                 type: string
 *                 example: "alice"
 *               receiver_tag:
 *                 type: string
 *                 example: "bob"
 *               amount:
 *                 type: number
 *                 example: 5.0
 *     responses:
 *       200:
 *         description: Transfer initiated
 */
router.post("/send-to-tag", controller.send_to_tag);

/**
 * @swagger
 * /api/send-to-wallet:
 *   post:
 *     summary: Send funds to a wallet address
 *     tags: [General]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sender_tag
 *               - receiver_address
 *               - amount
 *             properties:
 *               sender_tag:
 *                 type: string
 *               receiver_address:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Transfer initiated
 */
router.post("/send-to-wallet", controller.send_to_wallet);

/**
 * @swagger
 * /api/bill/balance:
 *   get:
 *     summary: Check bill payment wallet balance
 *     tags: [General]
 *     responses:
 *       200:
 *         description: Bill balance
 */
router.get("/bill/balance", controller.bill_balance);

/**
 * @swagger
 * /api/bill/data-variations:
 *   get:
 *     summary: List available data bundle variations
 *     tags: [General]
 *     responses:
 *       200:
 *         description: Data variations list
 */
router.get("/bill/data-variations", controller.bill_data_variations);

/**
 * @swagger
 * /api/bill/tv-variations:
 *   get:
 *     summary: List available TV subscription variations
 *     tags: [General]
 *     responses:
 *       200:
 *         description: TV variations list
 */
router.get("/bill/tv-variations", controller.bill_tv_variations);

/**
 * @swagger
 * /api/bill/tv-services:
 *   get:
 *     summary: List available TV service providers
 *     tags: [General]
 *     responses:
 *       200:
 *         description: TV services list
 */
router.get("/bill/tv-services", controller.bill_tv_services);

/**
 * @swagger
 * /api/bill/betting-services:
 *   get:
 *     summary: List available betting service providers
 *     tags: [General]
 *     responses:
 *       200:
 *         description: Betting services list
 */
router.get("/bill/betting-services", controller.bill_betting_services);

/**
 * @swagger
 * /api/bill/electricity-services:
 *   get:
 *     summary: List available electricity service providers
 *     tags: [General]
 *     responses:
 *       200:
 *         description: Electricity services list
 */
router.get("/bill/electricity-services", controller.bill_electricity_services);

/**
 * @swagger
 * /api/bill/airtime-services:
 *   get:
 *     summary: List available airtime service providers
 *     tags: [General]
 *     responses:
 *       200:
 *         description: Airtime services list
 */
router.get("/bill/airtime-services", controller.bill_airtime_services);

/**
 * @swagger
 * /api/bill/data-services:
 *   get:
 *     summary: List available data service providers
 *     tags: [General]
 *     responses:
 *       200:
 *         description: Data services list
 */
router.get("/bill/data-services", controller.bill_data_services);

/**
 * @swagger
 * /api/bill/requery:
 *   post:
 *     summary: Requery a bill payment transaction
 *     tags: [General]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reference:
 *                 type: string
 *                 example: "BILL_ref_abc123"
 *     responses:
 *       200:
 *         description: Bill transaction status
 */
router.post("/bill/requery", controller.bill_requery);

/**
 * @swagger
 * /api/bill/verify-customer:
 *   post:
 *     summary: Verify a bill payment customer
 *     description: Verify a customer's details before processing a bill payment (e.g., smart card number for TV, meter number for electricity).
 *     tags: [General]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               service_type:
 *                 type: string
 *                 example: "electricity"
 *               customer_id:
 *                 type: string
 *                 example: "1234567890"
 *     responses:
 *       200:
 *         description: Customer verified
 */
router.post("/bill/verify-customer", controller.bill_verify_customer);

/**
 * @swagger
 * /api/exchange-rates:
 *   get:
 *     summary: Get current exchange rates
 *     description: Returns current crypto-to-fiat exchange rates. Cached for 15 minutes.
 *     tags: [General]
 *     responses:
 *       200:
 *         description: Exchange rates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 XLM_USD:
 *                   type: number
 *                   example: 0.11
 *                 USDC_USD:
 *                   type: number
 *                   example: 1.0
 *                 USD_NGN:
 *                   type: number
 *                   example: 1550.0
 */
router.get("/exchange-rates", publicCache(900), controller.get_exchange_rates);

/**
 * @swagger
 * /api/convert:
 *   get:
 *     summary: Convert between currencies
 *     description: Convert an amount between any supported currencies (crypto or fiat).
 *     tags: [General]
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *         description: Source currency
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *         description: Target currency
 *       - in: query
 *         name: amount
 *         required: true
 *         schema:
 *           type: number
 *         description: Amount to convert
 *     responses:
 *       200:
 *         description: Converted amount
 */
router.get("/convert", controller.convert_currency);

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: General health check
 *     tags: [General]
 *     responses:
 *       200:
 *         description: Health status
 */
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: "anon",
  });
});

/**
 * @swagger
 * /api/api/crypto-rate:
 *   get:
 *     summary: Get cryptocurrency rate
 *     tags: [General]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token symbol
 *     responses:
 *       200:
 *         description: Crypto rate data
 */
router.get("/api/crypto-rate", async (req, res) => {
  const { token } = req.query;
  const data = await freecryptoapi.rate(token);
  res.status(200).json(data);
});

/**
 * @swagger
 * /api/api/fiat-rate:
 *   get:
 *     summary: Get fiat currency rate
 *     tags: [General]
 *     parameters:
 *       - in: query
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *         description: Currency code (e.g., NGN, USD)
 *     responses:
 *       200:
 *         description: Fiat rate data
 */
router.get("/api/fiat-rate", async (req, res) => {
  const { currency } = req.query;
  const data = await exchangerateapi.rate(currency);
  res.status(200).json(data);
});

/**
 * @swagger
 * /api/api/rates/ngn:
 *   get:
 *     summary: Get NGN exchange rate
 *     description: Returns the current USD-to-NGN exchange rate from cache.
 *     tags: [General]
 *     responses:
 *       200:
 *         description: NGN rate
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 USD:
 *                   type: number
 *                   example: 1
 *                 NGN:
 *                   type: number
 *                   example: 1550.0
 *       500:
 *         description: Failed to fetch NGN rate
 */
router.get("/api/rates/ngn", async (req, res) => {
  try {
    let ngnValue = await redis.get(NGN_KEY);

    if (!ngnValue) {
      console.log("⚠️ NGN rate not cached, fetching fresh...");
      await updateNgnRate();
      ngnValue = await redis.get(NGN_KEY);
    }

    return res.json({
      USD: 1,
      NGN: Number.parseFloat(ngnValue),
    });
  } catch (err) {
    console.error("❌ Error fetching NGN from Redis:", err.message);
    return res.status(500).json({ error: "Failed to fetch NGN rate" });
  }
});

export default router;
