import { jest } from "@jest/globals";
import distributedLock from "../utils/distributedLock.js";
import redis from "../config/redis.js";

jest.mock("../config/redis.js");

describe("DistributedLock", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should successfully acquire a lock", async () => {
    redis.set.mockResolvedValue("OK");
    
    const identifier = await distributedLock.acquire("test-key", 1000);
    
    expect(identifier).toBeDefined();
    expect(redis.set).toHaveBeenCalledWith("lock:test-key", identifier, {
      NX: true,
      PX: 1000,
    });
  });

  it("should fail to acquire lock if already held and retry", async () => {
    redis.set
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("OK");
    
    const identifier = await distributedLock.acquire("test-key", 1000, 2, 50);
    
    expect(identifier).toBeDefined();
    expect(redis.set).toHaveBeenCalledTimes(2);
  });

  it("should return null if max retries reached", async () => {
    redis.set.mockResolvedValue(null);
    
    const identifier = await distributedLock.acquire("test-key", 1000, 2, 10);
    
    expect(identifier).toBeNull();
    expect(redis.set).toHaveBeenCalledTimes(2);
  });

  it("should successfully release a lock", async () => {
    redis.eval.mockResolvedValue(1);
    
    const released = await distributedLock.release("test-key", "my-id");
    
    expect(released).toBe(true);
    expect(redis.eval).toHaveBeenCalled();
  });

  it("should fail to release lock if not owner", async () => {
    redis.eval.mockResolvedValue(0);
    
    const released = await distributedLock.release("test-key", "wrong-id");
    
    expect(released).toBe(false);
  });
});
