import { describe, it, expect, jest } from "@jest/globals";
import { putObject, deleteObject } from "../utils/s3Client.js";

const CREDS = {
  bucket: "taggedpay-backups",
  key: "database-backups/taggedpay_20260324T101112Z.dump.enc",
  region: "us-east-1",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secretexample",
};

describe("s3Client", () => {
  it("PUTs to the expected virtual-hosted-style URL with a signed Authorization header", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await putObject({
      ...CREDS,
      body: Buffer.from("dump bytes"),
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];

    expect(url).toBe(
      "https://taggedpay-backups.s3.us-east-1.amazonaws.com/database-backups/taggedpay_20260324T101112Z.dump.enc"
    );
    expect(options.method).toBe("PUT");
    expect(options.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\//);
    expect(options.headers["x-amz-content-sha256"]).toHaveLength(64);
    expect(options.body).toBeInstanceOf(Buffer);
  });

  it("throws when S3 responds with a non-2xx status", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    });

    await expect(
      putObject({ ...CREDS, body: Buffer.from("x"), fetchImpl })
    ).rejects.toThrow(/S3 upload failed \(403\)/);
  });

  it("DELETEs the object and tolerates a 404 (already gone)", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    await expect(deleteObject({ ...CREDS, fetchImpl })).resolves.toEqual({
      bucket: CREDS.bucket,
      key: CREDS.key,
      region: CREDS.region,
    });
  });

  it("throws on a genuine delete failure", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Error",
    });

    await expect(deleteObject({ ...CREDS, fetchImpl })).rejects.toThrow(/S3 delete failed \(500\)/);
  });
});
