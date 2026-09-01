/**
 * Unit tests for batch-payment Merkle integrity (issue #448).
 *
 * Verifies that a Merkle root commits to every payment leaf and that tampering
 * with any recipient or amount after the root is computed is detectable.
 *
 * Run with: npm test
 */

import { describe, it, expect } from "@jest/globals";
import {
  hashLeaf,
  buildMerkleTree,
  computeMerkleRoot,
  getProof,
  verifyLeaf,
} from "../utils/merkle.js";

const leaves = [
  { recipient: "GA1111111111111111111111111111111111111111111111111111", amount: 10, token: "XLM" },
  { recipient: "GB2222222222222222222222222222222222222222222222222222", amount: 25.5, token: "XLM" },
  { recipient: "GC3333333333333333333333333333333333333333333333333333", amount: 100, token: "XLM" },
];

describe("merkle utils", () => {
  it("produces a deterministic 0x-prefixed root", () => {
    const root1 = computeMerkleRoot(leaves);
    const root2 = computeMerkleRoot(leaves);
    expect(root1).toBe(root2);
    expect(root1).toMatch(/^0x[0-9a-f]+$/i);
  });

  it("verifies a valid proof for every leaf", () => {
    const { tree, root } = buildMerkleTree(leaves);
    for (const leaf of leaves) {
      const proof = getProof(tree, leaf);
      expect(verifyLeaf({ root, leaf, proof })).toBe(true);
    }
  });

  it("detects a tampered amount", () => {
    const { tree, root } = buildMerkleTree(leaves);
    const proof = getProof(tree, leaves[0]);
    const tampered = { ...leaves[0], amount: 9999 };
    expect(verifyLeaf({ root, leaf: tampered, proof })).toBe(false);
  });

  it("detects a tampered recipient", () => {
    const { tree, root } = buildMerkleTree(leaves);
    const proof = getProof(tree, leaves[1]);
    const tampered = { ...leaves[1], recipient: "GZ0000000000000000000000000000000000000000000000000000" };
    expect(verifyLeaf({ root, leaf: tampered, proof })).toBe(false);
  });

  it("changes the root when any leaf changes", () => {
    const rootA = computeMerkleRoot(leaves);
    const rootB = computeMerkleRoot([
      leaves[0],
      { ...leaves[1], amount: 26 },
      leaves[2],
    ]);
    expect(rootA).not.toBe(rootB);
  });

  it("hashes normalize equivalent amounts (1 vs 1.0)", () => {
    const a = hashLeaf({ recipient: "GA1", amount: 1, token: "XLM" });
    const b = hashLeaf({ recipient: "GA1", amount: 1.0, token: "XLM" });
    expect(a.equals(b)).toBe(true);
  });

  it("rejects malformed leaves", () => {
    expect(() => hashLeaf({ recipient: "", amount: 1, token: "XLM" })).toThrow();
    expect(() => buildMerkleTree([])).toThrow();
  });

  it("fails verification when proof is missing/empty for a multi-leaf tree", () => {
    const { root } = buildMerkleTree(leaves);
    expect(verifyLeaf({ root, leaf: leaves[0], proof: [] })).toBe(false);
  });
});
