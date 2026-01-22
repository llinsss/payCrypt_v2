import Joi from "joi";

export const transactionQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  from: Joi.string().isoDate().allow(null, ""),
  to: Joi.string().isoDate().allow(null, ""),
  type: Joi.string()
    .valid("payment", "account_merge", "credit", "debit", "transfer", "deposit", "withdrawal")
    .allow(null, ""),
  sortBy: Joi.string()
    .valid("created_at", "amount", "usd_value", "type", "status")
    .default("created_at"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

export const transactionSchema = Joi.object({
  user_id: Joi.any().allow("", null),
  wallet_id: Joi.any().allow("", null),
  reference: Joi.any().allow("", null),
  type: Joi.any().allow("", null),
  action: Joi.any().allow("", null),
  amount: Joi.any().allow("", null),
  balance_before: Joi.any().allow("", null),
  balance_after: Joi.any().allow("", null),
  status: Joi.any().allow("", null),
  hash: Joi.any().allow("", null),
  token: Joi.any().allow("", null),
  rate: Joi.any().allow("", null),
  description: Joi.any().allow("", null),
  extra: Joi.any().allow("", null),
  created_at: Joi.any().allow("", null),
  updated_at: Joi.any().allow("", null),
});
