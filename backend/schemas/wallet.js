import Joi from "joi";

export const walletSchema = Joi.object({
  user_id: Joi.any().allow("", null),
  name: Joi.any().allow("", null),
  balance: Joi.any().allow("", null),
  tag: Joi.any().allow("", null),
  address: Joi.any().allow("", null),
});
