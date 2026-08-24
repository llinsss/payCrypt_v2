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
 * Map Joi error types to machine-readable error codes.
 */
const getErrorCode = (detail) => {
  if (detail.type.includes("required")) return "FIELD_REQUIRED";
  if (detail.type.includes("empty")) return "FIELD_EMPTY";
  if (detail.type === "any.invalid") return "INVALID_VALUE";
  if (detail.type === "string.email") return "INVALID_EMAIL";
  if (detail.type === "string.pattern.base") return "INVALID_FORMAT";
  if (detail.type === "string.min") return "VALUE_TOO_SHORT";
  if (detail.type === "string.max") return "VALUE_TOO_LONG";
  if (detail.type === "number.min") return "VALUE_BELOW_MINIMUM";
  if (detail.type === "number.max") return "VALUE_ABOVE_MAXIMUM";
  if (detail.type === "array.min") return "ARRAY_TOO_SHORT";
  if (detail.type === "array.max") return "ARRAY_TOO_LONG";
  return "VALIDATION_ERROR";
};

/**
 * Format Joi validation errors into standardized { field, code, message } array.
 * Never echoes back sensitive values (passwords, tokens, secrets).
 */
const formatErrors = (joiError) =>
  joiError.details.map((d) => ({
    field: d.context?.key ?? d.path.join("."),
    code: getErrorCode(d),
    message: d.message.replace(/['"]/g, "").replace(/\[.*?\]/g, ""),
  }));

/**
 * Validate request body against a Joi schema.
 * Returns all validation errors at once (abortEarly: false).
 * Response: { error, message, errors: [{ field, code, message }, ...] }
 */
export const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Request validation failed",
        errors: formatErrors(error),
      });
    }

    req.body = sanitizeValue(value);
    next();
  };
};

/**
 * Validate query parameters against a Joi schema.
 * Returns all validation errors at once (abortEarly: false).
 * Response: { error, message, errors: [{ field, code, message }, ...] }
 */
export const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Query validation failed",
        errors: formatErrors(error),
      });
    }

    req.query = sanitizeValue(value);
    next();
  };
};

/**
 * Validate URL parameters against a Joi schema.
 * Returns all validation errors at once (abortEarly: false).
 * Response: { error, message, errors: [{ field, code, message }, ...] }
 */
export const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Parameter validation failed",
        errors: formatErrors(error),
      });
    }

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

/**
 * Detect and block common SQL injection patterns in requests
 */
export const detectSqlInjection = (req, res, next) => {
  const sqlInjectionPattern = /(union\s+select|select\s+.*\s+from|from\s+information_schema|or\s+1\s*=\s*1|drop\s+table|update\s+.*\s+set|delete\s+from|insert\s+into|exec\s*\(|;\s*--|--\s*$)/i;

  const detectInObject = (obj) => {
    if (typeof obj === "string") {
      return sqlInjectionPattern.test(obj);
    }
    if (typeof obj === "object" && obj !== null) {
      return Object.values(obj).some(detectInObject);
    }
    return false;
  };

  const hasSqlInjection =
    detectInObject(req.body) ||
    detectInObject(req.query) ||
    detectInObject(req.params);

  if (hasSqlInjection) {
    return res.status(403).json({
      status: "error",
      message: "Forbidden: Suspicious input detected",
    });
  }

  next();
};
