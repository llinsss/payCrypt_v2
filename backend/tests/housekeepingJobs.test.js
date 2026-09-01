import { jest } from "@jest/globals";

// HousekeepingService is exercised in isolation: the distributed lock, the
// audit log model, and the export service are all mocked so these tests
// assert on singleton-lease behavior (issue #566) without touching a real
// database, Redis, or filesystem.
jest.unstable_mockModule("../utils/distributedLock.js", () => ({
  default: {
    acquire: jest.fn(),
    release: jest.fn(),
  },
}));

jest.unstable_mockModule("../models/AuditLog.js", () => ({
  default: {
    deleteOlderThan: jest.fn(),
  },
}));

jest.unstable_mockModule("../services/ExportService.js", () => ({
  default: {
    cleanupExpiredExports: jest.fn(),
  },
}));

const { default: distributedLock } = await import("../utils/distributedLock.js");
const { default: AuditLog } = await import("../models/AuditLog.js");
const { default: ExportService } = await import("../services/ExportService.js");
const { default: HousekeepingService } = await import("../services/HousekeepingService.js");

describe("HousekeepingService singleton jobs (issue #566)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // jobState is module-level (ESM modules are singletons across the test
    // file), so metrics from one test would otherwise leak into the next.
    HousekeepingService.resetHousekeepingStatus();
  });

  describe("two-instance exclusion", () => {
    it("only runs the audit log cleanup on the instance that wins the lease when two instances race", async () => {
      // Simulate the Redis lock as shared, mutable state: whichever
      // "instance" calls acquire() first gets the lease, the other sees it
      // already held (mirrors distributedLock's real SET NX behavior).
      let locked = false;
      distributedLock.acquire.mockImplementation(async () => {
        if (locked) return null;
        locked = true;
        return "lease-token";
      });
      distributedLock.release.mockImplementation(async () => {
        locked = false;
        return true;
      });
      AuditLog.deleteOlderThan.mockResolvedValue(5);

      // Two "instances" attempt the same job concurrently.
      const [instanceA, instanceB] = await Promise.all([
        HousekeepingService.runAuditLogCleanup(90),
        HousekeepingService.runAuditLogCleanup(90),
      ]);

      const ran = [instanceA, instanceB].filter((r) => r.ran);
      const skipped = [instanceA, instanceB].filter((r) => !r.ran);

      expect(ran).toHaveLength(1);
      expect(skipped).toHaveLength(1);
      expect(AuditLog.deleteOlderThan).toHaveBeenCalledTimes(1);
      expect(AuditLog.deleteOlderThan).toHaveBeenCalledWith(90);
    });

    it("only runs the export cleanup on the instance that wins the lease when two instances race", async () => {
      let locked = false;
      distributedLock.acquire.mockImplementation(async () => {
        if (locked) return null;
        locked = true;
        return "lease-token";
      });
      distributedLock.release.mockImplementation(async () => {
        locked = false;
        return true;
      });
      ExportService.cleanupExpiredExports.mockResolvedValue(3);

      const [instanceA, instanceB] = await Promise.all([
        HousekeepingService.runExportCleanup(),
        HousekeepingService.runExportCleanup(),
      ]);

      const ran = [instanceA, instanceB].filter((r) => r.ran);
      const skipped = [instanceA, instanceB].filter((r) => !r.ran);

      expect(ran).toHaveLength(1);
      expect(skipped).toHaveLength(1);
      expect(ExportService.cleanupExpiredExports).toHaveBeenCalledTimes(1);
    });

    it("acquires the lease under a job-scoped key so audit and export cleanup never contend with each other", async () => {
      distributedLock.acquire.mockResolvedValue("lease-token");
      distributedLock.release.mockResolvedValue(true);
      AuditLog.deleteOlderThan.mockResolvedValue(0);
      ExportService.cleanupExpiredExports.mockResolvedValue(0);

      await HousekeepingService.runAuditLogCleanup(90);
      await HousekeepingService.runExportCleanup();

      const lockKeys = distributedLock.acquire.mock.calls.map((call) => call[0]);
      expect(new Set(lockKeys).size).toBe(2);
    });
  });

  describe("idempotency", () => {
    it("is safe to trigger the audit cleanup more than once (second run is a no-op)", async () => {
      distributedLock.acquire.mockResolvedValue("lease-token");
      distributedLock.release.mockResolvedValue(true);
      AuditLog.deleteOlderThan
        .mockResolvedValueOnce(12) // first run finds stale rows
        .mockResolvedValueOnce(0); // second run finds nothing left to delete

      const first = await HousekeepingService.runAuditLogCleanup(90);
      const second = await HousekeepingService.runAuditLogCleanup(90);

      expect(first.ran).toBe(true);
      expect(second.ran).toBe(true);
      expect(first.result).toEqual({ deleted: 12 });
      expect(second.result).toEqual({ deleted: 0 });
      expect(AuditLog.deleteOlderThan).toHaveBeenCalledTimes(2);
    });

    it("releases the lease even when the job throws, so the next tick can still acquire it", async () => {
      distributedLock.acquire.mockResolvedValue("lease-token");
      distributedLock.release.mockResolvedValue(true);
      AuditLog.deleteOlderThan.mockRejectedValueOnce(new Error("db unavailable"));

      await expect(HousekeepingService.runAuditLogCleanup(90)).rejects.toThrow("db unavailable");

      expect(distributedLock.release).toHaveBeenCalledWith(
        "housekeeping:audit-log-cleanup",
        "lease-token"
      );
    });
  });

  describe("last-run metrics", () => {
    it("exposes lastRunAt and the result for a replica that executed the job", async () => {
      distributedLock.acquire.mockResolvedValue("lease-token");
      distributedLock.release.mockResolvedValue(true);
      AuditLog.deleteOlderThan.mockResolvedValue(7);

      await HousekeepingService.runAuditLogCleanup(90);
      const status = HousekeepingService.getHousekeepingStatus();

      expect(status.auditLogCleanup.lastStatus).toBe("success");
      expect(status.auditLogCleanup.lastResult).toEqual({ deleted: 7 });
      expect(status.auditLogCleanup.lastRunAt).toEqual(expect.any(String));
      expect(typeof status.auditLogCleanup.lastDurationMs).toBe("number");
    });

    it("exposes lastSkippedAt (not lastRunAt) for a replica that lost the race for the lease", async () => {
      distributedLock.acquire.mockResolvedValue(null);

      const result = await HousekeepingService.runExportCleanup();
      const status = HousekeepingService.getHousekeepingStatus();

      expect(result.ran).toBe(false);
      expect(ExportService.cleanupExpiredExports).not.toHaveBeenCalled();
      expect(status.exportCleanup.lastSkippedAt).toEqual(expect.any(String));
      expect(status.exportCleanup.lastRunAt).toBeUndefined();
    });

    it("records lastStatus failed and lastError when the job throws", async () => {
      distributedLock.acquire.mockResolvedValue("lease-token");
      distributedLock.release.mockResolvedValue(true);
      ExportService.cleanupExpiredExports.mockRejectedValueOnce(new Error("disk full"));

      await expect(HousekeepingService.runExportCleanup()).rejects.toThrow("disk full");
      const status = HousekeepingService.getHousekeepingStatus();

      expect(status.exportCleanup.lastStatus).toBe("failed");
      expect(status.exportCleanup.lastError).toBe("disk full");
    });
  });
});
