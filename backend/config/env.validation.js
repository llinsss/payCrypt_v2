import Joi from "joi";

const port = Joi.number().integer().min(1).max(65535);
const uri = Joi.string().uri({ allowRelative: false });

export const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
  PORT: port.default(3000),
  DB_HOST: Joi.string().trim().min(1).required(),
  DB_PORT: port.default(5432),
  DB_NAME: Joi.string().trim().min(1).required(),
  DB_USER: Joi.string().trim().min(1).required(),
  DB_PASSWORD: Joi.string().allow("").required(),
  JWT_SECRET: Joi.string().min(32).required(),
  BULL_ADMIN_USER: Joi.string().trim().min(1).required(),
  BULL_ADMIN_PASS: Joi.string().min(1).required(),
  SWAGGER_ADMIN_USER: Joi.string().trim().min(1).required(),
  SWAGGER_ADMIN_PASS: Joi.string().min(1).required(),
  CORS_ORIGIN: Joi.string().custom((value, helpers) => {
    const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
    if (origins.length === 0 || origins.includes("*")) {
      return helpers.error("string.corsOrigin");
    }
    const invalidOrigin = origins.find((origin) => uri.validate(origin).error);
    if (invalidOrigin) return helpers.error("string.corsOrigin");
    return origins.join(",");
  }).messages({ "string.corsOrigin": "must be a comma-separated list of absolute URLs" }),
  SENTRY_DSN: uri,
  RPC_URL: uri,
  STARKNET_CONTRACT_ADDRESS: Joi.string().pattern(/^0x[0-9a-fA-F]{1,64}$/),
  WEBHOOK_SECRET: Joi.string().min(16),
  PUBLIC_BASE_URL: Joi.string().uri({ allowRelative: false }).optional(),
}).unknown(true);

export function validateEnv(environment = process.env) {
  const { error, value } = envSchema.validate(environment, {
    abortEarly: false,
    allowUnknown: true,
    convert: true,
  });

  if (error) {
    const details = error.details
      .map(({ path, message }) => `- ${path.join(".") || "environment"}: ${message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${details}`);
  }

  return value;
}
