import { describe, it, expect } from "@jest/globals";
import { encryptBuffer, decryptBuffer } from "../utils/backupEncryption.js";

describe("backupEncryption", () => {
  const key = "a".repeat(32); // arbitrary passphrase, gets hashed to 32 bytes

  it("round-trips a buffer through encrypt/decrypt", () => {
    const plaintext = Buffer.from("PGDMP-mock-backup-contents");

    const ciphertext = encryptBuffer(plaintext, key);
    expect(ciphertext.equals(plaintext)).toBe(false);

    const decrypted = decryptBuffer(ciphertext, key);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it("accepts a 64-char hex key directly as raw key material", () => {
    const hexKey = "0".repeat(64);
    const plaintext = Buffer.from("hello world");

    const ciphertext = encryptBuffer(plaintext, hexKey);
    const decrypted = decryptBuffer(ciphertext, hexKey);

    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it("produces different ciphertext for the same input on each call (random IV)", () => {
    const plaintext = Buffer.from("same input");

    const first = encryptBuffer(plaintext, key);
    const second = encryptBuffer(plaintext, key);

    expect(first.equals(second)).toBe(false);
  });

  it("fails to decrypt with the wrong key", () => {
    const plaintext = Buffer.from("secret dump bytes");
    const ciphertext = encryptBuffer(plaintext, key);

    expect(() => decryptBuffer(ciphertext, "b".repeat(32))).toThrow();
  });

  it("fails to decrypt tampered ciphertext", () => {
    const plaintext = Buffer.from("secret dump bytes");
    const ciphertext = encryptBuffer(plaintext, key);
    ciphertext[ciphertext.length - 1] ^= 0xff;

    expect(() => decryptBuffer(ciphertext, key)).toThrow();
  });
});
