import { jest } from "@jest/globals";

jest.unstable_mockModule("../utils/distributedLock.js", () => ({
  default: {
    acquire: jest.fn(),
    release: jest.fn()
  }
}));

const { default: LockService } = await import("../services/LockService.js");
const { default: distributedLock } = await import("../utils/distributedLock.js");

describe("Concurrency Test Simulation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should only allow one of two concurrent requests to acquire the lock", async () => {
    let callCount = 0;
    distributedLock.acquire.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return "id-1";
      return null;
    });

    const results = await Promise.allSettled([
      LockService.acquireUserLock(1),
      LockService.acquireUserLock(1)
    ]);

    const acquired = results.filter(r => r.status === "fulfilled" && r.value !== null);
    const failed = results.filter(r => r.status === "fulfilled" && r.value === null);

    expect(acquired.length).toBe(1);
    expect(failed.length).toBe(1);
  });

  it("should handle lock release and subsequent acquisition", async () => {
    distributedLock.acquire.mockResolvedValueOnce("id-1").mockResolvedValueOnce("id-2");
    distributedLock.release.mockResolvedValue(true);

    const id1 = await LockService.acquireUserLock(1);
    await LockService.releaseUserLock(1, id1);
    const id2 = await LockService.acquireUserLock(1);

    expect(id1).toBe("id-1");
    expect(id2).toBe("id-2");
  });

  it("should prevent concurrent access to same resource", async () => {
    const acquireStates = [];
    distributedLock.acquire.mockImplementation(async (key) => {
      acquireStates.push({ key, timestamp: Date.now() });
      if (acquireStates.length === 1) return "token-1";
      return null;
    });

    const [res1, res2] = await Promise.all([
      LockService.acquireUserLock(5),
      LockService.acquireUserLock(5)
    ]);

    expect(res1).toBe("token-1");
    expect(res2).toBeNull();
  });

  it("should use lock identifier for ownership-safe release", async () => {
    distributedLock.acquire.mockResolvedValue("owned-token-123");
    distributedLock.release.mockResolvedValue(true);

    const identifier = await LockService.acquireUserLock(1);
    const released = await LockService.releaseUserLock(1, identifier);

    expect(released).toBe(true);
    expect(distributedLock.release).toHaveBeenCalledWith("user:1:txn", "owned-token-123");
  });
});
