/**
 * validate(schema, property)
 *
 * Generic Joi validation middleware.
 *
 * Usage
 * ─────
 * import validate from "../middleware/validate.js";
 * import { createChainSchema } from "../validators/chainSchemas.js";
 *
 * router.post("/", validate(createChainSchema, "body"), createChain);
 * router.get("/",  validate(paginationSchema,  "query"), getChains);
 *
 * On failure → 422 Unprocessable Entity with structured error details.
 * On success → validated (and possibly coerced/stripped) value is written
 *              back to req[property] so controllers receive clean data.
 *
 * @param {import("joi").Schema} schema    - Joi schema to validate against
 * @param {"body"|"query"|"params"} [property="body"] - which part of req to validate
 */
export const validate = (schema, property = "body") => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,  // collect all errors, not just the first
      convert:    true,   // coerce strings to numbers/booleans where the schema expects them
    });

    if (error) {
      const details = error.details.map((d) => ({
        field:   d.path.join("."),
        message: d.message,
      }));

      return res.status(422).json({
        success: false,
        error:   "Validation failed",
        details,
      });
    }

    // Replace req[property] with the validated (and potentially coerced/stripped) value
    req[property] = value;
    next();
  };
};

export default validate;