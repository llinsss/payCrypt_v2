import Joi from "joi";
import { WEBHOOK_EVENTS } from "../services/WebhookService.js";

const ALLOWED_EVENTS = Object.values(WEBHOOK_EVENTS);

const registerSchema = Joi.object({
  url: Joi.string().uri({ scheme: ["http", "https"] }).max(2048).required(),
  events: Joi.array().items(Joi.string().valid(...ALLOWED_EVENTS)).min(1).required(),
  secret: Joi.string().min(16).max(256).optional(),
}).options({ allowUnknown: false });

const updateSchema = Joi.object({
  url: Joi.string().uri({ scheme: ["http", "https"] }).max(2048).optional(),
  events: Joi.array().items(Joi.string().valid(...ALLOWED_EVENTS)).min(1).optional(),
  is_active: Joi.boolean().optional(),
}).options({ allowUnknown: false });

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details.map((d) => d.message).join("; "),
    });
  }
  next();
};

export const validateRegister = validate(registerSchema);
export const validateUpdate = validate(updateSchema);
