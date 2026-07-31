/**
 * Unit tests for strict, chain-specific wallet address validation (issue #447).
 *
 * Covers valid + invalid addresses for all six supported chains and, critically,
 * cross-chain confusion (e.g. a Stellar address submitted to an EVM endpoint),
 * which is the failure mode that permanently loses user funds.
 *
 * Run with: npm test
 */

import { describe, it, expect } from "@jest/globals";
import { ethers } from "ethers";
import { Keypair } from "@stellar/stellar-sdk";

import {
  validateAddress,
  assertValidAddress,
  SUPPORTED_CHAINS,
} from "../utils/validateAddress.js";

// ── Known-valid sample addresses, one per chain ──────────────────────────────
// EVM + Stellar are generated so the tests never depend on hand-copied checksums.
const EVM_ADDR = ethers.Wallet.createRandom().address; // EIP-55 checksummed
const EVM_ADDR_LOWER = EVM_ADDR.toLowerCase();
const STELLAR_ADDR = Keypair.random().publicKey(); // G... 56 chars
const STARKNET_ADDR =
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const FLOW_ADDR = "0x1234567890abcdef"; // 0x + 16 hex (Cadence account)

const EVM_CHAINS = ["base", "lisk", "u2u"];

describe("validateAddress — valid addresses per chain", () => {
  it.each(EVM_CHAINS)("accepts a valid EVM address on %s", (chain) => {
    const result = validateAddress(EVM_ADDR, chain);
    expect(result.valid).toBe(true);
    // normalized to EIP-55 checksum form
    expect(result.normalized).toBe(EVM_ADDR);
  });

  it("accepts a lowercase EVM address and checksums it", () => {
    const result = validateAddress(EVM_ADDR_LOWER, "base");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe(EVM_ADDR);
  });

  it("accepts a valid Starknet address", () => {
    const result = validateAddress(STARKNET_ADDR, "starknet");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBeDefined();
  });

  it("accepts a valid Stellar address", () => {
    const result = validateAddress(STELLAR_ADDR, "stellar");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe(STELLAR_ADDR);
  });

  it("accepts a valid Flow address", () => {
    const result = validateAddress(FLOW_ADDR, "flow");
    expect(result.valid).toBe(true);
  });

  it("is case-insensitive for the chain identifier", () => {
    expect(validateAddress(EVM_ADDR, "BASE").valid).toBe(true);
    expect(validateAddress(STELLAR_ADDR, "Stellar").valid).toBe(true);
  });
});

describe("validateAddress — malformed addresses are rejected", () => {
  it.each(EVM_CHAINS)("rejects a too-short EVM address on %s", (chain) => {
    const result = validateAddress("0x1234", chain);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("chain");
  });

  it("rejects an EVM address with a bad checksum", () => {
    // Mixed-case but not a valid EIP-55 checksum.
    const bad = "0xAbCdEf1234567890abcdef1234567890ABCDEF12";
    expect(validateAddress(bad, "base").valid).toBe(false);
  });

  it("rejects garbage for Starknet", () => {
    expect(validateAddress("not-an-address", "starknet").valid).toBe(false);
  });

  it("rejects a Stellar secret key (S...) as a public address", () => {
    const secret = Keypair.random().secret(); // S... 56 chars
    expect(validateAddress(secret, "stellar").valid).toBe(false);
  });

  it("rejects a wrong-length Flow address", () => {
    expect(validateAddress("0x1234567890abcde", "flow").valid).toBe(false); // 15 hex
    expect(validateAddress("0x1234567890abcdef0", "flow").valid).toBe(false); // 17 hex
  });

  it("rejects empty / missing input", () => {
    expect(validateAddress("", "base").valid).toBe(false);
    expect(validateAddress("   ", "base").valid).toBe(false);
    expect(validateAddress(undefined, "base").valid).toBe(false);
    expect(validateAddress(EVM_ADDR, "").valid).toBe(false);
  });

  it("rejects an unsupported chain", () => {
    const result = validateAddress(EVM_ADDR, "bitcoin");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unsupported chain");
  });
});

describe("validateAddress — cross-chain confusion is caught", () => {
  it("rejects a Stellar address on an EVM endpoint", () => {
    const result = validateAddress(STELLAR_ADDR, "base");
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "Invalid address for Base chain. Expected 0x... format.",
    );
  });

  it("rejects an EVM address on a Stellar endpoint", () => {
    const result = validateAddress(EVM_ADDR, "stellar");
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "Invalid address for Stellar chain. Expected G... format.",
    );
  });

  it("rejects a Starknet address (64 hex) on an EVM endpoint", () => {
    // Starknet addresses are far longer than 40 hex chars.
    expect(validateAddress(STARKNET_ADDR, "base").valid).toBe(false);
    expect(validateAddress(STARKNET_ADDR, "u2u").valid).toBe(false);
  });

  it("rejects an EVM address on a Flow endpoint (40 hex vs 16 hex)", () => {
    expect(validateAddress(EVM_ADDR, "flow").valid).toBe(false);
  });

  it("rejects a Flow address on an EVM endpoint", () => {
    expect(validateAddress(FLOW_ADDR, "base").valid).toBe(false);
  });
});

describe("assertValidAddress", () => {
  it("returns the normalized address when valid", () => {
    expect(assertValidAddress(EVM_ADDR_LOWER, "base")).toBe(EVM_ADDR);
  });

  it("throws a 400 INVALID_ADDRESS error when invalid", () => {
    expect.assertions(3);
    try {
      assertValidAddress(STELLAR_ADDR, "base");
    } catch (err) {
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("INVALID_ADDRESS");
      expect(err.message).toContain("Invalid address for Base chain");
    }
  });
});

describe("SUPPORTED_CHAINS", () => {
  it("covers all six supported chains", () => {
    for (const chain of ["base", "lisk", "u2u", "starknet", "stellar", "flow"]) {
      expect(SUPPORTED_CHAINS).toContain(chain);
    }
  });
});
