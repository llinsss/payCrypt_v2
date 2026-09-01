import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockResolveBackupConfig = jest.fn();
const mockListBackupMetadata = jest.fn();
const mockReadRestoreDrill = jest.fn();

jest.unstable_mockModule("../scripts/backup.js", () => ({
  resolveBackupConfig: mockResolveBackupConfig,
}));

jest.unstable_mockModule("../utils/backupMetadata.js", () => ({
  listBackupMetadata: mockListBackupMetadata,
  readRestoreDrill: mockReadRestoreDrill,
}));

let listBackups;

beforeEach(async () => {
  jest.clearAllMocks();
  mockReadRestoreDrill.mockResolvedValue(null);
  ({ listBackups } = await import("../controllers/backupAdminController.js"));
});

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe("backupAdminController.listBackups", () => {
  it("returns recent backups with retention/S3 info", async () => {
    mockResolveBackupConfig.mockReturnValue({
      backupDir: "/tmp/backups",
      retentionDays: 30,
      s3Bucket: "taggedpay-backups",
    });
    mockListBackupMetadata.mockResolvedValue([
      { filename: "taggedpay_20260301T000000Z.dump.enc", uploadedToS3: true },
    ]);

    const req = { query: {} };
    const res = makeRes();

    await listBackups(req, res);

    expect(mockListBackupMetadata).toHaveBeenCalledWith("/tmp/backups", 30);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{ filename: "taggedpay_20260301T000000Z.dump.enc", uploadedToS3: true }],
      retentionDays: 30,
      s3Enabled: true,
      restoreDrill: null,
    });
  });

  it("clamps an out-of-range limit query param", async () => {
    mockResolveBackupConfig.mockReturnValue({ backupDir: "/tmp/backups", retentionDays: 30, s3Bucket: null });
    mockListBackupMetadata.mockResolvedValue([]);

    const req = { query: { limit: "500" } };
    const res = makeRes();

    await listBackups(req, res);

    expect(mockListBackupMetadata).toHaveBeenCalledWith("/tmp/backups", 100);
  });

  it("returns 500 on unexpected errors", async () => {
    mockResolveBackupConfig.mockImplementation(() => {
      throw new Error("boom");
    });

    const req = { query: {} };
    const res = makeRes();

    await listBackups(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: "Internal Server Error" });
  });
});
