import Joi from "joi";

const passwordRule = Joi.string()
  .min(8)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  .required()
  .messages({
    "string.min": "Password must be at least 8 characters long",
    "string.pattern.base":
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)",
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
};
