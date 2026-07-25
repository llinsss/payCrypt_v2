import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const HEX_64_RE = /^[0-9a-fA-F]{64}$/;

// Accepts a 32-byte key given as hex, or any passphrase (derived into a
// 32-byte key via SHA-256) so operators aren't forced into one encoding.
function deriveKey(encryptionKey) {
  const raw = HEX_64_RE.test(encryptionKey)
    ? Buffer.from(encryptionKey, "hex")
    : Buffer.from(encryptionKey, "utf8");

  return raw.length === 32 ? raw : createHash("sha256").update(raw).digest();
}

/**
 * Encrypts a buffer with AES-256-GCM.
 * Output layout: [iv (12 bytes)] [authTag (16 bytes)] [ciphertext]
 */
export function encryptBuffer(buffer, encryptionKey) {
  const key = deriveKey(encryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]);
}

/**
 * Reverses encryptBuffer(). Throws if the key is wrong or the payload was
 * tampered with (GCM auth tag verification failure).
 */
export function decryptBuffer(payload, encryptionKey) {
  const key = deriveKey(encryptionKey);
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
