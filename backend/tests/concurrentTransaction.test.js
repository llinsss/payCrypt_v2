import { jest } from "@jest/globals";
import LockService from "../services/LockService.js";
import distributedLock from "../utils/distributedLock.js";

// Mock the lower level lock utility
jest.mock("../utils/distributedLock.js");

describe("Concurrency Test Simulation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should only allow one of two concurrent requests to acquire the lock", async () => {
    let callCount = 0;
    distributedLock.acquire.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return "id-1";
      return null; // Fail second one immediately for this test
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
});
