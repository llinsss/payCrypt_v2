import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const MASTER_KEY_HEX_LENGTH = 64;
const STELLAR_SECRET_REGEX = /^S[A-Z0-9]{55}$/;

const DEFAULT_STORAGE_PATH = path.join(
  process.cwd(),
  "data",
  "key-vault.json",
);

function getMasterKey() {
  const keyHex = process.env.KEY_VAULT_MASTER_KEY;

  if (!keyHex || keyHex.length !== MASTER_KEY_HEX_LENGTH) {
    throw new Error(
      "KEY_VAULT_MASTER_KEY must be a 64-character hex string",
    );
  }

  return Buffer.from(keyHex, "hex");
}

function getStoragePath() {
  return process.env.KEY_VAULT_STORAGE_PATH || DEFAULT_STORAGE_PATH;
}

function normalizeSecret(secret) {
  if (typeof secret !== "string" || !STELLAR_SECRET_REGEX.test(secret)) {
    throw new Error("Invalid Stellar secret key format");
  }

  return secret;
}

function normalizeSecrets(secret, additionalSigningKeys = []) {
  if (!Array.isArray(additionalSigningKeys)) {
    throw new Error("additionalSigningKeys must be an array");
  }

  const secrets = [
    normalizeSecret(secret),
    ...additionalSigningKeys.map(normalizeSecret),
  ];

  return [...new Set(secrets)];
}

function encryptWithKey(plaintext, key) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
}

function decryptWithKey(envelope, key) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(envelope.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "hex"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "hex")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

export function encryptSecrets(secrets) {
  const dataKey = crypto.randomBytes(32);

  return {
    version: 1,
    wrappedKey: encryptWithKey(dataKey.toString("hex"), getMasterKey()),
    payload: encryptWithKey(JSON.stringify({ secrets }), dataKey),
  };
}

export function decryptSecrets(record) {
  const dataKeyHex = decryptWithKey(record.wrappedKey, getMasterKey());
  const dataKey = Buffer.from(dataKeyHex, "hex");
  const payload = JSON.parse(decryptWithKey(record.payload, dataKey));

  if (!Array.isArray(payload.secrets) || payload.secrets.length === 0) {
    throw new Error("Stored signing keys are invalid");
  }

  return payload.secrets.map(normalizeSecret);
}

async function readVaultFile() {
  try {
    const raw = await fs.readFile(getStoragePath(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeVaultFile(store) {
  const storagePath = getStoragePath();
  const directory = path.dirname(storagePath);
  const tempPath = `${storagePath}.tmp`;

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
  await fs.rename(tempPath, storagePath);
}

class KeyVaultService {
  async storeUserSecrets(userId, { secret, additionalSigningKeys = [] }) {
    const normalizedUserId = String(userId);
    const secrets = normalizeSecrets(secret, additionalSigningKeys);
    const store = await readVaultFile();

    store[normalizedUserId] = {
      ...encryptSecrets(secrets),
      updatedAt: new Date().toISOString(),
      secretCount: secrets.length,
    };

    await writeVaultFile(store);
  }

  async getUserSecrets(userId) {
    const normalizedUserId = String(userId);
    const store = await readVaultFile();
    const record = store[normalizedUserId];

    if (!record) {
      const error = new Error("No signing keys registered for this user");
      error.statusCode = 422;
      throw error;
    }

    return decryptSecrets(record);
  }

  async withUserSecrets(userId, callback) {
    const secrets = await this.getUserSecrets(userId);

    try {
      return await callback(secrets);
    } finally {
      secrets.fill(null);
    }
  }

  async deleteUserSecrets(userId) {
    const normalizedUserId = String(userId);
    const store = await readVaultFile();

    if (!store[normalizedUserId]) {
      return false;
    }

    delete store[normalizedUserId];
    await writeVaultFile(store);
    return true;
  }
}

export default new KeyVaultService();
