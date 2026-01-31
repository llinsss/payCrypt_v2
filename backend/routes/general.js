import express from "express";
import redis from "../config/redis.js";
import * as freecryptoapi from "../services/free-crypto-api.js";
import * as exchangerateapi from "../services/exchange-rate-api.js";
import { NGN_KEY } from "../config/initials.js";
import * as controller from "../controllers/generalController.js";

const router = express.Router();

/**
 * @swagger
 * /upload-file:
 *   post:
 *     summary: Upload a file
 *     description: Uploads a file to Cloudinary and returns the URL.
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   example: "https://res.cloudinary.com/..."
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/upload-file", controller.upload_file);

/**
 * @swagger
 * /register-tag:
 *   post:
 *     summary: Register a tag on-chain
 *     description: Registers a @tag on a specific blockchain network.
 *     tags: [General]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - chain
 *               - tag
 *             properties:
 *               chain:
 *                 type: string
 *                 description: Blockchain network
 *                 example: "stellar"
 *               tag:
 *                 type: string
 *                 example: "johndoe"
 *     responses:
 *       200:
 *         description: Tag registered on-chain
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/register-tag", controller.register_tag);

/**
 * @swagger
 * /get-tag-address:
 *   post:
 *     summary: Get tag's blockchain address
 *     description: Resolves a @tag to its address on a specific blockchain.
 *     tags: [General]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - chain
 *               - tag
 *             properties:
 *               chain:
 *                 type: string
 *                 example: "stellar"
 *               tag:
 *                 type: string
 *                 example: "johndoe"
 *     responses:
 *       200:
 *         description: Address resolved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 address:
 *                   type: string
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/get-tag-address", controller.get_tag_address);

/**
 * @swagger
 * /get-tag-balance:
 *   post:
 *     summary: Get tag's on-chain balance
 *     description: Queries the blockchain for a @tag's balance.
 *     tags: [General]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - chain
 *               - tag
 *             properties:
 *               chain:
 *                 type: string
 *                 example: "stellar"
 *               tag:
 *                 type: string
 *                 example: "johndoe"
 *     responses:
 *       200:
 *         description: Balance retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balance:
 *                   type: string
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/get-tag-balance", controller.get_tag_balance);

/**
 * @swagger
 * /send-to-tag:
 *   post:
 *     summary: Send funds to a tag on-chain
 *     description: Initiates an on-chain transfer from one @tag to another.
 *     tags: [General]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - chain
 *               - sender_tag
 *               - receiver_tag
 *               - amount
 *             properties:
 *               chain:
 *                 type: string
 *                 example: "stellar"
 *               sender_tag:
 *                 type: string
 *                 example: "johndoe"
 *               receiver_tag:
 *                 type: string
 *                 example: "janedoe"
 *               amount:
 *                 type: number
 *                 example: 100.00
 *     responses:
 *       200:
 *         description: Transfer initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 tx_hash:
 *                   type: string
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/send-to-tag", controller.send_to_tag);

/**
 * @swagger
 * /send-to-wallet:
 *   post:
 *     summary: Send funds to a wallet address on-chain
 *     description: Initiates an on-chain transfer from a @tag to a wallet address.
 *     tags: [General]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - chain
 *               - sender_tag
 *               - receiver_address
 *               - amount
 *             properties:
 *               chain:
 *                 type: string
 *                 example: "stellar"
 *               sender_tag:
 *                 type: string
 *                 example: "johndoe"
 *               receiver_address:
 *                 type: string
 *                 example: "GXYZ123..."
 *               amount:
 *                 type: number
 *                 example: 50.00
 *     responses:
 *       200:
 *         description: Transfer initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 tx_hash:
 *                   type: string
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/send-to-wallet", controller.send_to_wallet);

/**
 * @swagger
 * /bill/balance:
 *   get:
 *     summary: Get VTU bill balance
 *     description: Retrieves the current VTU service balance.
 *     tags: [Bills & VTU]
 *     responses:
 *       200:
 *         description: Balance retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/balance", controller.bill_balance);

/**
 * @swagger
 * /bill/data-variations:
 *   get:
 *     summary: Get data plan variations
 *     description: Retrieves available data plan options and pricing.
 *     tags: [Bills & VTU]
 *     responses:
 *       200:
 *         description: Data variations retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/data-variations", controller.bill_data_variations);

/**
 * @swagger
 * /bill/tv-variations:
 *   get:
 *     summary: Get TV subscription variations
 *     description: Retrieves available TV subscription plans and pricing.
 *     tags: [Bills & VTU]
 *     responses:
 *       200:
 *         description: TV variations retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/tv-variations", controller.bill_tv_variations);

/**
 * @swagger
 * /bill/tv-services:
 *   get:
 *     summary: Get TV service providers
 *     description: Retrieves available TV service providers (e.g., DSTV, GOtv).
 *     tags: [Bills & VTU]
 *     responses:
 *       200:
 *         description: TV services retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/tv-services", controller.bill_tv_services);

/**
 * @swagger
 * /bill/betting-services:
 *   get:
 *     summary: Get betting service providers
 *     description: Retrieves available betting platforms for wallet funding.
 *     tags: [Bills & VTU]
 *     responses:
 *       200:
 *         description: Betting services retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/betting-services", controller.bill_betting_services);

/**
 * @swagger
 * /bill/electricity-services:
 *   get:
 *     summary: Get electricity service providers
 *     description: Retrieves available electricity distribution companies.
 *     tags: [Bills & VTU]
 *     responses:
 *       200:
 *         description: Electricity services retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/electricity-services", controller.bill_electricity_services);

/**
 * @swagger
 * /bill/airtime-services:
 *   get:
 *     summary: Get airtime service providers
 *     description: Retrieves available mobile airtime providers.
 *     tags: [Bills & VTU]
 *     responses:
 *       200:
 *         description: Airtime services retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/airtime-services", controller.bill_airtime_services);

/**
 * @swagger
 * /bill/data-services:
 *   get:
 *     summary: Get data service providers
 *     description: Retrieves available mobile data providers.
 *     tags: [Bills & VTU]
 *     responses:
 *       200:
 *         description: Data services retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/data-services", controller.bill_data_services);

/**
 * @swagger
 * /bill/requery:
 *   post:
 *     summary: Requery a bill transaction
 *     description: Re-checks the status of a previously initiated bill payment.
 *     tags: [Bills & VTU]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - request_id
 *             properties:
 *               request_id:
 *                 type: string
 *                 description: Original transaction request ID
 *                 example: "req_abc123"
 *     responses:
 *       200:
 *         description: Requery result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/bill/requery", controller.bill_requery);

/**
 * @swagger
 * /bill/verify-customer:
 *   post:
 *     summary: Verify a bill customer
 *     description: Verifies customer details before processing a bill payment (e.g., meter number, smartcard number).
 *     tags: [Bills & VTU]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - service_id
 *               - customer_id
 *             properties:
 *               service_id:
 *                 type: string
 *                 description: Service provider ID
 *                 example: "ikeja-electric"
 *               customer_id:
 *                 type: string
 *                 description: Customer identifier (meter/smartcard number)
 *                 example: "1234567890"
 *               variation_id:
 *                 type: string
 *                 description: Service variation
 *                 example: "prepaid"
 *     responses:
 *       200:
 *         description: Customer verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 customer_name:
 *                   type: string
 *                 address:
 *                   type: string
 *       400:
 *         description: Customer not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/bill/verify-customer", controller.bill_verify_customer);

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: "anon",
  });
});

/**
 * @swagger
 * /api/crypto-rate:
 *   get:
 *     summary: Get cryptocurrency rate
 *     description: Retrieves the current USD price for a cryptocurrency token.
 *     tags: [Rates]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token symbol
 *         example: "BTC"
 *     responses:
 *       200:
 *         description: Crypto rate retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 symbol:
 *                   type: string
 *                   example: "BTC"
 *                 price:
 *                   type: number
 *                   example: 45000.00
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/api/crypto-rate", async (req, res) => {
  const { token } = req.query;
  const data = await freecryptoapi.rate(token);
  res.status(200).json(data);
});

/**
 * @swagger
 * /api/fiat-rate:
 *   get:
 *     summary: Get fiat exchange rate
 *     description: Retrieves the exchange rate for a fiat currency against USD.
 *     tags: [Rates]
 *     parameters:
 *       - in: query
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *         description: Currency code
 *         example: "NGN"
 *     responses:
 *       200:
 *         description: Fiat rate retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/api/fiat-rate", async (req, res) => {
  const { currency } = req.query;
  const data = await exchangerateapi.rate(currency);
  res.status(200).json(data);
});

/**
 * @swagger
 * /api/rates/ngn:
 *   get:
 *     summary: Get USD to NGN exchange rate
 *     description: Retrieves the current USD to NGN exchange rate from Redis cache.
 *     tags: [Rates]
 *     responses:
 *       200:
 *         description: NGN rate retrieved
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
 *                   example: 1600.50
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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
