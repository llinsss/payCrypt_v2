import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";

/**
 * Merkle-tree utilities for batch-payment integrity (issue #448).
 *
 * A batch of up to 50 payments is processed off-chain, which means a compromised
 * backend or a tampered batch job could silently alter a recipient or amount.
 * To make tampering detectable, we compute a Merkle root over every payment leaf
 * (recipient + amount + token) before execution, persist that root with the
 * batch, and verify each leaf's Merkle proof against the stored root immediately
 * before that payment is executed. Any mismatch aborts the batch.
 *
 * Leaves are hashed with keccak256 and the tree is built with sorted pairs so a
 * proof can be verified without knowing leaf ordering.
 */

/**
 * Canonically hash a single payment leaf.
 *
 * The leaf commits to the three fields that must not change between the time the
 * root is computed and the payment is executed: recipient, amount, and token.
 *
 * @param {{ recipient: string, amount: number|string, token: string }} leaf
 * @returns {Buffer} keccak256 hash of the canonical leaf string
 */
export function hashLeaf({ recipient, amount, token }) {
  if (!recipient || amount === undefined || amount === null || !token) {
    throw new Error("Merkle leaf requires recipient, amount, and token");
  }
  // Normalise amount to a fixed decimal string so 1 and 1.0 hash identically.
  const normalizedAmount = Number(amount).toString();
  const canonical = `${recipient}|${normalizedAmount}|${token}`;
  return keccak256(canonical);
}

/**
 * Build a Merkle tree from prepared batch items.
 *
 * @param {Array<{ recipient: string, amount: number|string, token: string }>} leaves
 * @returns {{ tree: MerkleTree, root: string, leafHashes: Buffer[] }}
 *   `root` is a 0x-prefixed hex string.
 */
export function buildMerkleTree(leaves) {
  if (!Array.isArray(leaves) || leaves.length === 0) {
    throw new Error("Cannot build a Merkle tree from an empty leaf set");
  }
  const leafHashes = leaves.map((leaf) => hashLeaf(leaf));
  const tree = new MerkleTree(leafHashes, keccak256, { sortPairs: true });
  return { tree, root: tree.getHexRoot(), leafHashes };
}

/**
 * Compute the Merkle root for a set of leaves.
 *
 * @param {Array<{ recipient: string, amount: number|string, token: string }>} leaves
 * @returns {string} 0x-prefixed hex root
 */
export function computeMerkleRoot(leaves) {
  return buildMerkleTree(leaves).root;
}

/**
 * Get the hex Merkle proof for a specific leaf within a tree.
 *
 * @param {MerkleTree} tree
 * @param {{ recipient: string, amount: number|string, token: string }} leaf
 * @returns {string[]} array of 0x-prefixed hex proof nodes
 */
export function getProof(tree, leaf) {
  return tree.getHexProof(hashLeaf(leaf));
}

/**
 * Verify that a leaf belongs to the tree with the given root.
 *
 * @param {object} params
 * @param {string} params.root - 0x-prefixed hex root
 * @param {{ recipient: string, amount: number|string, token: string }} params.leaf
 * @param {string[]} params.proof - hex proof from {@link getProof}
 * @returns {boolean}
 */
export function verifyLeaf({ root, leaf, proof }) {
  if (!root || !Array.isArray(proof)) return false;
  const leafHash = hashLeaf(leaf);
  return MerkleTree.verify(proof, leafHash, root, keccak256, {
    sortPairs: true,
  });
}

export default {
  hashLeaf,
  buildMerkleTree,
  computeMerkleRoot,
  getProof,
  verifyLeaf,
};
