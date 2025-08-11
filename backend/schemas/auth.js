import Joi from "joi";

export const authSchemas = {
  register: Joi.object({
    tag: Joi.string().min(3).max(50).required(),
    email: Joi.string().email().required(),
    address: Joi.any().allow("", null),
    password: Joi.string().min(6).required(),
  }),

  login: Joi.object({
    entity: Joi.string().required(),
    password: Joi.string().required(),
  }),
};
