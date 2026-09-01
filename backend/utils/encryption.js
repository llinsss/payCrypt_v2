/**
 * AES-256-GCM application-layer encryption for PII fields at rest.
 *
 * Issue #459 — Encrypt sensitive PII before writing to the database so that a
 * database breach does not expose plaintext personal data (NDPR compliance).
 *
 * Encryption key
 * --------------
 * The 32-byte key is read from the ENCRYPTION_KEY environment variable, which
 * must be a 64-character hex string (e.g. `openssl rand -hex 32`).  The key is
 * never stored in source code or committed to git.
 *
 * Algorithm: AES-256-GCM
 *   - 256-bit key provides maximum AES security.
 *   - GCM mode provides authenticated encryption (integrity + confidentiality).
 *   - A fresh 12-byte IV is generated per encryption operation.
 *
 * Ciphertext format (base64-encoded, colon-delimited):
 *   <iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * Performance: encryption and decryption are synchronous Node.js `crypto`
 * operations and are well under 1 ms per call for typical PII field lengths.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_BYTES = 16; // 128-bit authentication tag

/**
 * Derive the encryption key from the ENCRYPTION_KEY env variable.
 * Throws at import-time if the variable is missing or malformed so that the
 * application fails fast rather than silently storing plaintext.
 *
 * @returns {Buffer} 32-byte key buffer
 */
function loadKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    // Warn but do not crash in test environments that do not configure encryption.
    if (process.env.NODE_ENV === "test") {
      return Buffer.alloc(32, 0); // deterministic zero key — tests only
    }
    throw new Error(
      "ENCRYPTION_KEY environment variable is required. " +
      "Generate one with: openssl rand -hex 32",
    );
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
      "Generate one with: openssl rand -hex 32",
    );
  }
  return key;
}

// Load once at startup — any misconfiguration surfaces immediately.
const ENCRYPTION_KEY = loadKey();

/**
 * Encrypt a plaintext string.
 *
 * @param {string|null|undefined} plaintext - The value to encrypt.
 * @returns {string|null} Encrypted payload string, or null if input is null/undefined/empty.
 */
export function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === "") {
    return plaintext ?? null;
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Encode as <iv_hex>:<authTag_hex>:<ciphertext_hex>
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a ciphertext string produced by `encrypt()`.
 *
 * @param {string|null|undefined} ciphertext - The encrypted payload string.
 * @returns {string|null} Decrypted plaintext, or null if input is null/undefined/empty.
 * @throws {Error} If the ciphertext is malformed or authentication fails.
 */
export function decrypt(ciphertext) {
  if (ciphertext === null || ciphertext === undefined || ciphertext === "") {
    return ciphertext ?? null;
  }

  const parts = String(ciphertext).split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format: expected iv:authTag:data");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;

  let iv, authTag, encrypted;
  try {
    iv = Buffer.from(ivHex, "hex");
    authTag = Buffer.from(authTagHex, "hex");
    encrypted = Buffer.from(encryptedHex, "hex");
  } catch {
    throw new Error("Invalid ciphertext encoding");
  }

  if (iv.length !== IV_BYTES) {
    throw new Error(`Invalid IV length: expected ${IV_BYTES} bytes`);
  }
  if (authTag.length !== AUTH_TAG_BYTES) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_BYTES} bytes`);
  }

  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(), // throws if auth tag is invalid
  ]);

  return decrypted.toString("utf8");
}

/**
 * Returns true if the given string looks like an encrypted payload produced
 * by `encrypt()`.  Useful for migration scripts that need to skip already-
 * encrypted rows.
 *
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export function isEncrypted(value) {
  if (!value || typeof value !== "string") return false;
  const parts = value.split(":");
  // iv (24 hex chars) + authTag (32 hex chars) + any ciphertext
  return (
    parts.length === 3 &&
    /^[0-9a-f]{24}$/i.test(parts[0]) &&
    /^[0-9a-f]{32}$/i.test(parts[1]) &&
    parts[2].length > 0
  );
}
