import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it, beforeEach, afterEach, jest } from "@jest/globals";

const TEST_MASTER_KEY = "a".repeat(64);
const TEST_SECRET = "S".concat("A".repeat(55));

describe("KeyVaultService", () => {
  let storagePath;

  beforeEach(async () => {
    jest.resetModules();
    storagePath = path.join(
      os.tmpdir(),
      `tagged-key-vault-${Date.now()}-${Math.random()}.json`,
    );
    process.env.KEY_VAULT_MASTER_KEY = TEST_MASTER_KEY;
    process.env.KEY_VAULT_STORAGE_PATH = storagePath;
  });

  afterEach(async () => {
    await fs.rm(storagePath, { force: true });
    delete process.env.KEY_VAULT_STORAGE_PATH;
    delete process.env.KEY_VAULT_MASTER_KEY;
  });

  it("encrypts and decrypts a stored key round-trip without persisting plaintext", async () => {
    const { default: KeyVaultService } = await import("../../services/KeyVaultService.js");

    await KeyVaultService.storeUserSecrets(42, {
      secret: TEST_SECRET,
      additionalSigningKeys: ["S".concat("B".repeat(55))],
    });

    const persisted = await fs.readFile(storagePath, "utf8");
    expect(persisted).not.toContain(TEST_SECRET);

    const secrets = await KeyVaultService.getUserSecrets(42);
    expect(secrets).toEqual([
      TEST_SECRET,
      "S".concat("B".repeat(55)),
    ]);
  });

  it("detects tampering during decrypt", async () => {
    const { decryptSecrets, encryptSecrets } = await import("../../services/KeyVaultService.js");
    const encrypted = encryptSecrets([TEST_SECRET]);

    encrypted.payload.ciphertext = encrypted.payload.ciphertext.replace(/.$/, "f");

    expect(() => decryptSecrets(encrypted)).toThrow();
  });
});
