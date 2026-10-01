import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),

  // Stellar Configuration
  STELLAR_NETWORK: Joi.string()
    .valid('testnet', 'mainnet')
    .required(),
  STELLAR_HORIZON_URL: Joi.string()
    .uri()
    .required(),

  // Token contract allowlisting trust boundary
  // The contract ID that is allowed to be registered as a trusted token.
  TOKEN_CONTRACT_ID: Joi.string()
    .pattern(/^[A-Z0-9]{56}$/)
    .required(),
  // Only these addresses may perform allowlist mutations.
  TOKEN_ALLOWLIST_ADMINS: Joi.string()
    .required()
    .custom((value, helpers) => {
      const addresses = value.split(',').map((a) => a.trim()).filter(Boolean);
      if (addresses.length === 0) {
        return helpers.error('TOKEN_ALLOWLIST_ADMINS must contain at least one address');
      }
      const invalid = addresses.filter((a) => !/^[A-Z0-9]{56}$/.test(a));
      if (invalid.length > 0) {
        return helpers.error(`Invalid Stellar address in TOKEN_ALLOWLIST_ADMINS: ${invalid.join(', ')}`);
      }
      return value;
    }),
  // Deterministic replay protection window in seconds.
  TOKEN_ALLOWLIST_REPLAY_WINDOW_SECONDS: Joi.number()
    .integer()
    .min(1)
    .max(86400)
    .default(300),
  // Maximum number of contract calls allowed per transaction envelope.
  TOKEN_ALLOWLIST_MAX_CALLS_PER_TX: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10),

  // Database Configuration
  DATABASE_URL: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  DATABASE_HOST: Joi.string().default('localhost'),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_USERNAME: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),

  // Redis Configuration
  REDIS_URL: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional(),

  // JWT Configuration
  JWT_SECRET: Joi.string().required().min(32),
  JWT_EXPIRES_IN: Joi.string().default('1d'),
});
