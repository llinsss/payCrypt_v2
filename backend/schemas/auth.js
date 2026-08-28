import Joi from "joi";
import { PASSWORD_POLICY } from "../validators/passwordPolicy.js";

const passwordRule = Joi.string()
  .min(PASSWORD_POLICY.MIN_LENGTH)
  .max(PASSWORD_POLICY.MAX_LENGTH)
  .regex(PASSWORD_POLICY.FULL_REGEX)
  .required()
  .messages({
    "string.min": `Password must be at least ${PASSWORD_POLICY.MIN_LENGTH} characters long`,
    "string.max": `Password must be at most ${PASSWORD_POLICY.MAX_LENGTH} characters long`,
    "string.pattern.base":
      `Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character (${PASSWORD_POLICY.SPECIAL_CHARS})`,
    "any.required": "Password is required",
    "string.empty": "Password cannot be empty",
  });

export const authSchemas = {
  register: Joi.object({
    tag: Joi.string()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9_]+$/)
      .required()
      .messages({
        "string.min": "Tag must be at least 3 characters long",
        "string.max": "Tag must be at most 50 characters long",
        "string.pattern.base": "Tag may only contain letters, numbers, and underscores",
        "any.required": "Tag is required",
        "string.empty": "Tag cannot be empty",
      }),

    email: Joi.string()
      .email()
      .lowercase()
      .required()
      .messages({
        "string.email": "Please provide a valid email address",
        "any.required": "Email is required",
        "string.empty": "Email cannot be empty",
      }),

    password: passwordRule,

    address: Joi.string().allow("", null).optional(),
    role: Joi.string().valid("user", "admin").allow("", null).optional(),
  }),

  login: Joi.object({
    email: Joi.string()
      .email()
      .required()
      .messages({
        "string.email": "Please provide a valid email address",
        "any.required": "Email is required",
        "string.empty": "Email cannot be empty",
      }),

    password: Joi.string()
      .required()
      .messages({
        "any.required": "Password is required",
        "string.empty": "Password cannot be empty",
      }),
  }),

  twoFactorToken: Joi.object({
    token: Joi.string()
      .trim()
      .pattern(/^[A-Za-z0-9]{6,32}$/)
      .required()
      .messages({
        "string.pattern.base": "Token must be 6-32 alphanumeric characters",
        "any.required": "Token is required",
        "string.empty": "Token cannot be empty",
      }),
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string()
      .trim()
      .min(1)
      .required()
      .messages({
        "any.required": "Refresh token is required",
        "string.empty": "Refresh token cannot be empty",
      }),
  }),
};
