import db from "../config/database.js";
import UssdService from "../services/UssdService.js";
import { failure, success } from "../utils/response.js";

export const handleUssd = async (req, res) => {
  try {
    const { sessionId, serviceCode, phoneNumber, text } = req.body;

    if (!sessionId || !phoneNumber) {
      return failure(res, "Missing required fields", null, 400);
    }

    const result = await UssdService.handleUssdRequest(
      sessionId,
      phoneNumber,
      text || "",
    );

    res.set("Content-Type", "text/plain");
    return res.send(result.message);
  } catch (error) {
    console.error("USSD Error:", error);
    res.set("Content-Type", "text/plain");
    return res.send("END Service temporarily unavailable. Please try again.");
  }
};

export const getUssdStats = async (req, res) => {
  try {
    const stats = await db("transactions")
      .where({ channel: "ussd" })
      .select(
        db.raw("COUNT(*) as total_transactions"),
        db.raw("SUM(amount) as total_volume"),
        db.raw("COUNT(DISTINCT user_id) as unique_users"),
      )
      .first();

    return success(res, "successful", stats);
  } catch (error) {
    return failure(res, error.message);
  }
};
