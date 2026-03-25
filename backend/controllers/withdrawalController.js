import OffRampService from "../services/OffRampService.js";
import Withdrawal from "../models/Withdrawal.js";
import Joi from "joi";

const initiateWithdrawalSchema = Joi.object({
  tokenId: Joi.number().integer().required(),
  bankAccountId: Joi.number().integer().required(),
  amountCrypto: Joi.number().positive().required()
});

export const initiateWithdrawal = async (req, res) => {
  try {
    const { error, value } = initiateWithdrawalSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ status: "error", message: error.details[0].message });
    }

    const { tokenId, bankAccountId, amountCrypto } = value;
    const userId = req.user.id;

    const withdrawal = await OffRampService.initiateWithdrawal({
      userId,
      tokenId,
      bankAccountId,
      amountCrypto
    });

    res.status(201).json({
      status: "success",
      message: "Withdrawal initiated successfully",
      data: withdrawal
    });
  } catch (error) {
    console.error("Controller: initiateWithdrawal error:", error.message);
    res.status(400).json({ status: "error", message: error.message });
  }
};

export const getMyWithdrawals = async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;
    const userId = req.user.id;

    const withdrawals = await Withdrawal.getByUserId(userId, parseInt(limit), parseInt(offset));

    res.status(200).json({
      status: "success",
      data: withdrawals
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

export const getWithdrawalDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const withdrawal = await Withdrawal.findById(id);

    if (!withdrawal || withdrawal.user_id !== userId) {
      return res.status(404).json({ status: "error", message: "Withdrawal not found" });
    }

    res.status(200).json({
      status: "success",
      data: withdrawal
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};
