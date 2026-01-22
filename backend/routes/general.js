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
 *     description: Uploads a file to cloud storage (Cloudinary) and returns the URL
 *     tags: [General]
 *     security: []
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
 *               $ref: '#/components/schemas/FileUploadResponse'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/upload-file", controller.upload_file);

/**
 * @swagger
 * /register-tag:
 *   post:
 *     summary: Register a tag on blockchain
 *     description: Registers a user tag on the specified blockchain network
 *     tags: [General]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterTagRequest'
 *           example:
 *             tag: "johndoe"
 *             chain: "starknet"
 *     responses:
 *       200:
 *         description: Tag registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 address:
 *                   type: string
 *                   description: Generated wallet address for the tag
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/register-tag", controller.register_tag);

/**
 * @swagger
 * /get-tag-address:
 *   post:
 *     summary: Get wallet address for a tag
 *     description: Retrieves the wallet address associated with a user tag on a specific chain
 *     tags: [General]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GetTagAddressRequest'
 *           example:
 *             tag: "johndoe"
 *             chain: "starknet"
 *     responses:
 *       200:
 *         description: Address retrieved successfully
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
 *     summary: Get balance for a tag
 *     description: Retrieves the token balance for a user tag on a specific chain
 *     tags: [General]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GetTagBalanceRequest'
 *           example:
 *             tag: "johndoe"
 *             chain: "starknet"
 *     responses:
 *       200:
 *         description: Balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balance:
 *                   type: number
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/get-tag-balance", controller.get_tag_balance);

/**
 * @swagger
 * /send-to-tag:
 *   post:
 *     summary: Send funds to a tag (public)
 *     description: Public endpoint to send funds to a user tag
 *     tags: [General]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendToTagRequest'
 *     responses:
 *       200:
 *         description: Transfer successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TransferResponse'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/send-to-tag", controller.send_to_tag);

/**
 * @swagger
 * /send-to-wallet:
 *   post:
 *     summary: Send funds to a wallet (public)
 *     description: Public endpoint to send funds to a wallet address
 *     tags: [General]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendToWalletRequest'
 *     responses:
 *       200:
 *         description: Transfer successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TransferResponse'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/send-to-wallet", controller.send_to_wallet);

/**
 * @swagger
 * /bill/balance:
 *   get:
 *     summary: Get bill payment service balance
 *     description: Retrieves the available balance for bill payment services
 *     tags: [General]
 *     security: []
 *     responses:
 *       200:
 *         description: Balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balance:
 *                   type: number
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/balance", controller.bill_balance);

/**
 * @swagger
 * /bill/data-variations:
 *   get:
 *     summary: Get data plan variations
 *     description: Retrieves available data plan variations for mobile data purchases
 *     tags: [General]
 *     security: []
 *     responses:
 *       200:
 *         description: Data variations retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BillVariation'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/data-variations", controller.bill_data_variations);

/**
 * @swagger
 * /bill/tv-variations:
 *   get:
 *     summary: Get TV subscription variations
 *     description: Retrieves available TV subscription packages
 *     tags: [General]
 *     security: []
 *     responses:
 *       200:
 *         description: TV variations retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BillVariation'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/tv-variations", controller.bill_tv_variations);

/**
 * @swagger
 * /bill/tv-services:
 *   get:
 *     summary: Get TV service providers
 *     description: Retrieves list of supported TV service providers (DSTV, GOTV, Startimes, etc.)
 *     tags: [General]
 *     security: []
 *     responses:
 *       200:
 *         description: TV services retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BillService'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/tv-services", controller.bill_tv_services);

/**
 * @swagger
 * /bill/betting-services:
 *   get:
 *     summary: Get betting service providers
 *     description: Retrieves list of supported betting platforms for wallet funding
 *     tags: [General]
 *     security: []
 *     responses:
 *       200:
 *         description: Betting services retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BillService'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/betting-services", controller.bill_betting_services);

/**
 * @swagger
 * /bill/electricity-services:
 *   get:
 *     summary: Get electricity service providers
 *     description: Retrieves list of electricity distribution companies
 *     tags: [General]
 *     security: []
 *     responses:
 *       200:
 *         description: Electricity services retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BillService'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/electricity-services", controller.bill_electricity_services);

/**
 * @swagger
 * /bill/airtime-services:
 *   get:
 *     summary: Get airtime service providers
 *     description: Retrieves list of mobile network operators for airtime purchase
 *     tags: [General]
 *     security: []
 *     responses:
 *       200:
 *         description: Airtime services retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BillService'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/airtime-services", controller.bill_airtime_services);

/**
 * @swagger
 * /bill/data-services:
 *   get:
 *     summary: Get data service providers
 *     description: Retrieves list of mobile network operators for data purchase
 *     tags: [General]
 *     security: []
 *     responses:
 *       200:
 *         description: Data services retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BillService'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get("/bill/data-services", controller.bill_data_services);

/**
 * @swagger
 * /bill/requery:
 *   post:
 *     summary: Requery bill payment status
 *     description: Check the status of a previous bill payment transaction
 *     tags: [General]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               request_id:
 *                 type: string
 *                 description: The original request ID
 *     responses:
 *       200:
 *         description: Transaction status retrieved
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
 *     summary: Verify bill customer
 *     description: Verify a customer's meter number, smartcard number, or account
 *     tags: [General]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               billersCode:
 *                 type: string
 *                 description: Customer's meter/smartcard number
 *               serviceID:
 *                 type: string
 *                 description: Service ID (e.g., dstv, gotv, ikeja-electric)
 *               type:
 *                 type: string
 *                 description: Verification type
 *     responses:
 *       200:
 *         description: Customer verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 Customer_Name:
 *                   type: string
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post("/bill/verify-customer", controller.bill_verify_customer);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the API
 *     tags: [General]
 *     security: []
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "OK"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
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
 * /api/crypto-rate:
 *   get:
 *     summary: Get cryptocurrency rate
 *     description: Retrieves the current price of a cryptocurrency token
 *     tags: [General]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token symbol (e.g., BTC, ETH, USDT)
 *         example: "ETH"
 *     responses:
 *       200:
 *         description: Rate retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CryptoRate'
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
 *     summary: Get fiat currency rate
 *     description: Retrieves the exchange rate for a fiat currency against USD
 *     tags: [General]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *         description: Currency code (e.g., NGN, EUR, GBP)
 *         example: "NGN"
 *     responses:
 *       200:
 *         description: Rate retrieved successfully
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
 *     summary: Get NGN exchange rate
 *     description: Retrieves the current USD to NGN exchange rate
 *     tags: [General]
 *     security: []
 *     responses:
 *       200:
 *         description: NGN rate retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FiatRate'
 *             example:
 *               USD: 1
 *               NGN: 1600
 *       500:
 *         description: Failed to fetch rate
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Failed to fetch NGN rate"
 */
router.get("/api/rates/ngn", async (req, res) => {
  try {
    let ngnValue = await redis.get(NGN_KEY);

    if (!ngnValue) {
      console.log("NGN rate not cached, fetching fresh...");
      await updateNgnRate();
      ngnValue = await redis.get(NGN_KEY);
    }

    return res.json({
      USD: 1,
      NGN: Number.parseFloat(ngnValue),
    });
  } catch (err) {
    console.error("Error fetching NGN from Redis:", err.message);
    return res.status(500).json({ error: "Failed to fetch NGN rate" });
  }
});

export default router;
