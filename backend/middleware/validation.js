import Joi from "joi";
import sanitizeHtml from "sanitize-html";

/**
 * Sanitize string values to prevent XSS
 */
const sanitizeValue = (value) => {
  if (typeof value === "string") {
    return sanitizeHtml(value, {
      allowedTags: [],
      allowedAttributes: {},
    }).trim();
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).reduce((acc, [key, val]) => {
      acc[key] = sanitizeValue(val);
      return acc;
    }, Array.isArray(value) ? [] : {});
  }
  return value;
};

/**
 * Validate request body against Joi schema
 */
export const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      stripUnknown: true,
    });
    
    if (error) {
      return res.status(400).json({
        error: error.details[0].message,
        field: error.details[0].context.key,
      });
    }

    // Sanitize the validated data
    req.body = sanitizeValue(value);
    next();
  };
};

/**
 * Validate query parameters against Joi schema
 */
export const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      stripUnknown: true,
    });
    
    if (error) {
      return res.status(400).json({
        error: error.details[0].message,
        field: error.details[0].context.key,
      });
    }

    // Sanitize the validated data
    req.query = sanitizeValue(value);
    next();
  };
};

/**
 * Validate URL parameters
 */
export const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      stripUnknown: true,
    });
    
    if (error) {
      return res.status(400).json({
        error: error.details[0].message,
        field: error.details[0].context.key,
      });
    }

    // Sanitize the validated data
    req.params = sanitizeValue(value);
    next();
  };
};

/**
 * Custom validator for email
 */
export const emailSchema = Joi.object({
  email: Joi.string()
    .email()
    .lowercase()
    .required()
    .messages({
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required",
    }),
});

/**
 * Custom validator for password
 */
export const passwordSchema = Joi.object({
  password: Joi.string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      "string.pattern.base":
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      "string.min": "Password must be at least 8 characters long",
      "any.required": "Password is required",
    }),
});

/**
 * Custom validator for phone
 */
export const phoneSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/)
    .required()
    .messages({
      "string.pattern.base": "Please provide a valid phone number",
      "any.required": "Phone number is required",
    }),
});

/**
 * Sanitize request body, query, and params
 */
export const sanitizeRequest = (req, res, next) => {
  req.body = sanitizeValue(req.body);
  req.query = sanitizeValue(req.query);
  req.params = sanitizeValue(req.params);
  next();
};
