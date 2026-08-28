import Joi from "joi";

/**
 * Shared pagination query-string schema.
 *
 * Rules
 * ─────
 * page  – positive integer, default 1, max 10 000
 * limit – positive integer, default 10, max 100
 *
 * Any value that is not a whole positive integer (NaN, 0, negative,
 * fractional, string) is rejected with a 422 response via the
 * validate() middleware.
 */
export const paginationSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .max(10_000)
    .default(1)
    .messages({
      "number.base":    "page must be a number",
      "number.integer": "page must be an integer",
      "number.min":     "page must be at least 1",
      "number.max":     "page must not exceed 10000",
    }),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
    .messages({
      "number.base":    "limit must be a number",
      "number.integer": "limit must be an integer",
      "number.min":     "limit must be at least 1",
      "number.max":     "limit must not exceed 100",
    }),
}).options({ allowUnknown: true }); // let other query params pass through unchanged