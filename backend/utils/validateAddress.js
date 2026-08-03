import { ethers } from "ethers";
import { validateAndParseAddress } from "starknet";
import { StrKey } from "@stellar/stellar-sdk";

/**
 * Strict, chain-specific wallet address validation.
 *
 * Sending funds to an address that is valid on the wrong chain (e.g. pasting a
 * Starknet address into a Base withdrawal) results in permanent loss of funds.
 * This utility enforces the exact address format expected by each supported
 * chain *before* any DB record is created or on-chain transaction is submitted.
 *
 * Chains supported by Tagged (see contracts/index.js `chains` map + Stellar):
 *   - EVM (Base, Lisk, U2U): ethers.isAddress — 0x + 40 hex chars
 *   - Starknet:              starknet.validateAndParseAddress — 0x + up to 64 hex
 *   - Stellar:               StrKey.isValidEd25519PublicKey — G... 56 chars
 *   - Flow:                  Cadence account address — 0x + 16 hex chars
 *
 * Flow runs through its own (non-EVM) contract service in this codebase, so Flow
 * addresses are the 8-byte Cadence account format that @onflow/fcl canonicalises
 * (`0x` + 16 hex), not the 20-byte EVM format. This is validated directly to
 * avoid pulling the browser-oriented @onflow/fcl dependency into the backend.
 */

/** Canonical list of chains this validator understands. */
export const SUPPORTED_CHAINS = [
  "base",
  "lisk",
  "u2u",
  "evm",
  "starknet",
  "stellar",
  "flow",
];

/** EVM-compatible chain identifiers that share the 0x + 40 hex format. */
const EVM_CHAINS = new Set(["base", "lisk", "u2u", "evm"]);

/** Flow (Cadence) account address: 0x followed by exactly 16 hex chars. */
const FLOW_ADDRESS_REGEX = /^0x[0-9a-fA-F]{16}$/;

/** Human-friendly chain names for error messages. */
const CHAIN_DISPLAY_NAMES = {
  base: "Base",
  lisk: "Lisk",
  u2u: "U2U",
  evm: "EVM",
  starknet: "Starknet",
  stellar: "Stellar",
  flow: "Flow",
};

/** Expected-format hint shown in error messages, per chain. */
const EXPECTED_FORMAT = {
  base: "0x...",
  lisk: "0x...",
  u2u: "0x...",
  evm: "0x...",
  starknet: "0x...",
  stellar: "G...",
  flow: "0x...",
};

const displayName = (chain) =>
  CHAIN_DISPLAY_NAMES[chain] ?? String(chain ?? "unknown");

const invalidResult = (chain) => ({
  valid: false,
  error: `Invalid address for ${displayName(chain)} chain. Expected ${
    EXPECTED_FORMAT[chain] ?? "a valid"
  } format.`,
});

/**
 * Validate a wallet address for a specific chain.
 *
 * @param {string} address - The wallet address to validate.
 * @param {string} chain - Chain identifier (case-insensitive), one of
 *   {@link SUPPORTED_CHAINS}.
 * @returns {{ valid: boolean, error?: string, normalized?: string }}
 *   `valid` indicates whether the address is well-formed for the chain.
 *   On success, `normalized` is the canonical form (EIP-55 checksummed for EVM,
 *   left-padded for Starknet). On failure, `error` is a clear, chain-specific
 *   message safe to surface to the user.
 */
export function validateAddress(address, chain) {
  if (typeof address !== "string" || address.trim().length === 0) {
    return { valid: false, error: "Wallet address is required." };
  }
  if (typeof chain !== "string" || chain.trim().length === 0) {
    return { valid: false, error: "Chain is required for address validation." };
  }

  const key = chain.trim().toLowerCase();
  const addr = address.trim();

  if (!SUPPORTED_CHAINS.includes(key)) {
    return {
      valid: false,
      error: `Unsupported chain "${chain}". Supported chains: ${SUPPORTED_CHAINS.join(
        ", ",
      )}.`,
    };
  }

  if (EVM_CHAINS.has(key)) {
    // ethers.isAddress accepts both all-lowercase and EIP-55 checksummed forms
    // but rejects wrong-length / non-hex / bad-checksum inputs.
    if (!ethers.isAddress(addr)) {
      return invalidResult(key);
    }
    return { valid: true, normalized: ethers.getAddress(addr) };
  }

  if (key === "starknet") {
    try {
      // Throws on malformed field elements or out-of-range values.
      const normalized = validateAndParseAddress(addr);
      return { valid: true, normalized };
    } catch {
      return invalidResult(key);
    }
  }

  if (key === "stellar") {
    if (!StrKey.isValidEd25519PublicKey(addr)) {
      return invalidResult(key);
    }
    return { valid: true, normalized: addr };
  }

  if (key === "flow") {
    if (!FLOW_ADDRESS_REGEX.test(addr)) {
      return invalidResult(key);
    }
    return { valid: true, normalized: addr.toLowerCase() };
  }

  // Unreachable given the SUPPORTED_CHAINS guard above, kept for safety.
  return invalidResult(key);
}

/**
 * Assert that an address is valid for a chain, throwing an HTTP-friendly 400
 * error otherwise. Returns the normalized address on success.
 *
 * @param {string} address
 * @param {string} chain
 * @returns {string} normalized address
 * @throws {Error} with `statusCode = 400` and `code = "INVALID_ADDRESS"`
 */
export function assertValidAddress(address, chain) {
  const result = validateAddress(address, chain);
  if (!result.valid) {
    const error = new Error(result.error);
    error.statusCode = 400;
    error.code = "INVALID_ADDRESS";
    throw error;
  }
  return result.normalized ?? address.trim();
}

export default validateAddress;
