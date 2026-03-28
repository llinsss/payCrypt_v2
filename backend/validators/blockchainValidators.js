import Joi from "joi";

/**
 * Supported blockchain networks and their address formats.
 */
export const SUPPORTED_CHAINS = ["starknet", "base", "flow", "lisk", "u2u", "evm", "stellar"];

/**
 * Per-chain address regex patterns.
 *
 * starknet  – 0x followed by 1-64 hex chars (field element, left-zero-padded)
 * base/evm  – Standard EVM: 0x followed by exactly 40 hex chars (EIP-55 checksum optional)
 * flow      – 0x followed by exactly 16 hex chars
 * lisk      – lsk prefix followed by 38 base32 chars (Lisk v6 address format)
 * u2u       – Same format as EVM (0x + 40 hex)
 * stellar   – G followed by 55 uppercase base32 (A-Z2-7) chars
 */
const CHAIN_ADDRESS_PATTERNS = {
  starknet: /^0x[0-9a-fA-F]{1,64}$/,
  base: /^0x[a-fA-F0-9]{40}$/,
  evm: /^0x[a-fA-F0-9]{40}$/,
  flow: /^0x[a-fA-F0-9]{16}$/,
  lisk: /^lsk[a-z2-7]{38}$/,
  u2u: /^0x[a-fA-F0-9]{40}$/,
  stellar: /^G[A-Z2-7]{55}$/,
};

const CHAIN_ADDRESS_EXAMPLES = {
  starknet: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  base: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
  evm: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
  flow: "0x1234567890abcdef",
  lisk: "lskabcdefghijklmnopqrstuvwxyz234567890abc",
  u2u: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
  stellar: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
};

/**
 * Validates a blockchain address for a given chain.
 * Returns a Joi custom validator function.
 */
export const addressForChain = (chain) => {
  const pattern = CHAIN_ADDRESS_PATTERNS[chain];
  if (!pattern) {
    throw new Error(`No address pattern defined for chain: ${chain}`);
  }
  return (value, helpers) => {
    if (!pattern.test(value)) {
      return helpers.error("string.pattern.base", {
        message: `Invalid ${chain} address format (e.g. ${CHAIN_ADDRESS_EXAMPLES[chain]})`,
      });
    }
    return value;
  };
};

/**
 * Joi schema: validates an address against a known chain pattern.
 * The chain must be one of SUPPORTED_CHAINS.
 *
 * Usage: validate({ address, chain }) with addressWithChainSchema
 */
export const addressWithChainSchema = Joi.object({
  address: Joi.string().required().messages({
    "any.required": "Address is required",
    "string.empty": "Address cannot be empty",
  }),
  chain: Joi.string()
    .valid(...SUPPORTED_CHAINS)
    .required()
    .messages({
      "any.only": `Chain must be one of: ${SUPPORTED_CHAINS.join(", ")}`,
      "any.required": "Chain is required",
    }),
}).custom((value, helpers) => {
  const { address, chain } = value;
  const pattern = CHAIN_ADDRESS_PATTERNS[chain];
  if (pattern && !pattern.test(address)) {
    return helpers.message(
      `Invalid ${chain} address format. Example: ${CHAIN_ADDRESS_EXAMPLES[chain]}`
    );
  }
  return value;
});

/**
 * Joi extension: a string().blockchainAddress(chain) type.
 *
 * Usage:
 *   Joi.string().blockchainAddress('evm').required()
 *   Joi.string().blockchainAddress('starknet').required()
 */
export const blockchainAddressField = (chain) => {
  const pattern = CHAIN_ADDRESS_PATTERNS[chain] ?? /^.{10,}$/;
  return Joi.string()
    .pattern(pattern)
    .messages({
      "string.pattern.base": `Invalid ${chain} address format. Example: ${CHAIN_ADDRESS_EXAMPLES[chain] ?? "a valid blockchain address"}`,
    });
};

/**
 * Validates a Stellar secret key (S + 55 base32 uppercase chars).
 */
export const stellarSecretKey = () =>
  Joi.string()
    .pattern(/^S[A-Z2-7]{55}$/)
    .messages({
      "string.pattern.base": "Invalid Stellar secret key format (must start with S followed by 55 uppercase base32 characters)",
    });

/**
 * Validates a generic blockchain address with a minimum length guard.
 * Use when the specific chain is unknown at schema-definition time.
 */
export const genericBlockchainAddress = () =>
  Joi.string()
    .min(10)
    .max(130)
    .messages({
      "string.min": "Blockchain address appears too short (minimum 10 characters)",
      "string.max": "Blockchain address appears too long (maximum 130 characters)",
    });
