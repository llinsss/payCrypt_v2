import Joi from "joi";

export const authSchemas = {
  register: Joi.object({
    tag: Joi.string().pattern(/^[a-zA-Z0-9_]{3,20}$/).required(),
    email: Joi.string().email().required(),
    address: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required(),
    password: Joi.string().min(8).required(),
  }),

  login: Joi.object({
    entity: Joi.string().required(),
    password: Joi.string().required(),
  }),
};
