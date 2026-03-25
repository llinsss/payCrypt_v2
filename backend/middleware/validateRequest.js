import Joi from "joi";
import sanitizeHtml from "sanitize-html";

/**
 * Recursively sanitize string values to prevent XSS.
 */
const sanitizeValue = (value) => {
  if (typeof value === "string") {
    return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();
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
 * Format Joi errors into a consistent array of { field, message } objects.
 */
const formatErrors = (joiError) =>
  joiError.details.map((d) => ({
    field: d.context?.key ?? d.path.join("."),
    message: d.message.replace(/['"]/g, ""),
  }));

/**
 * Build the standard 400 validation-error response body.
 * Aligns with the failure() shape from utils/response.js but includes
 * a structured `errors` array for field-level detail.
 */
const validationErrorResponse = (res, errors) =>
  res.status(400).json({
    error: true,
    message: "Validation failed",
    errors,
  });

/**
 * Shared Joi validation options used across all validators.
 */
const JOI_OPTIONS = {
  abortEarly: false,   // collect all errors, not just the first
  stripUnknown: true,  // drop unrecognized keys silently
  convert: true,       // coerce query-string strings to numbers/bools where schema says so
};

/**
 * Validate req.body against a Joi schema.
 *
 * @param {Joi.ObjectSchema} schema
 */
export const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, JOI_OPTIONS);
  if (error) return validationErrorResponse(res, formatErrors(error));
  req.body = sanitizeValue(value);
  next();
};

/**
 * Validate req.query against a Joi schema.
 *
 * @param {Joi.ObjectSchema} schema
 */
export const validateQuery = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, JOI_OPTIONS);
  if (error) return validationErrorResponse(res, formatErrors(error));
  req.query = sanitizeValue(value);
  next();
};

/**
 * Validate req.params against a Joi schema.
 *
 * @param {Joi.ObjectSchema} schema
 */
export const validateParams = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.params, JOI_OPTIONS);
  if (error) return validationErrorResponse(res, formatErrors(error));
  req.params = sanitizeValue(value);
  next();
};

/**
 * Validate multiple request parts in a single middleware call.
 *
 * @param {{ body?: Joi.ObjectSchema, query?: Joi.ObjectSchema, params?: Joi.ObjectSchema }} schemas
 *
 * @example
 * router.put('/:id', validateRequest({ params: idSchema, body: updateSchema }), handler);
 */
export const validateRequest = ({ body, query, params } = {}) =>
  (req, res, next) => {
    const allErrors = [];

    if (params) {
      const { error, value } = params.validate(req.params, JOI_OPTIONS);
      if (error) allErrors.push(...formatErrors(error));
      else req.params = sanitizeValue(value);
    }

    if (query) {
      const { error, value } = query.validate(req.query, JOI_OPTIONS);
      if (error) allErrors.push(...formatErrors(error));
      else req.query = sanitizeValue(value);
    }

    if (body) {
      const { error, value } = body.validate(req.body, JOI_OPTIONS);
      if (error) allErrors.push(...formatErrors(error));
      else req.body = sanitizeValue(value);
    }

    if (allErrors.length > 0) return validationErrorResponse(res, allErrors);
    next();
  };
