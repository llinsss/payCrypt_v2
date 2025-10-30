import express from "express";
import redis from "../config/redis.js";
import * as freecryptoapi from "../services/free-crypto-api.js";
import * as exchangerateapi from "../services/exchange-rate-api.js";
import { NGN_KEY } from "../config/initials.js";
import * as controller from "../controllers/generalController.js";

const router = express.Router();

router.post("/upload-file", controller.upload_file);
router.get("/bill/balance", controller.bill_balance);
router.get("/bill/data-variations", controller.bill_data_variations);
router.get("/bill/tv-variations", controller.bill_tv_variations);
router.get("/bill/tv-services", controller.bill_tv_services);
router.get("/bill/betting-services", controller.bill_betting_services);
router.get("/bill/electricity-services", controller.bill_electricity_services);
router.get("/bill/airtime-services", controller.bill_airtime_services);
router.get("/bill/data-services", controller.bill_data_services);
router.post("/bill/requery", controller.bill_requery);
router.post("/bill/verify-customer", controller.bill_verify_customer);
// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: "anon",
  });
});

// Get crypto rate
router.get("/api/crypto-rate", async (req, res) => {
  const { token } = req.query;
  const data = await freecryptoapi.rate(token);
  res.status(200).json(data);
});

// Get fiat rate
router.get("/api/fiat-rate", async (req, res) => {
  const { currency } = req.query;
  const data = await exchangerateapi.rate(currency);
  res.status(200).json(data);
});

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
