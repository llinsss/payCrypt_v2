import { jest } from "@jest/globals";

const dbQuery = {
  insert: jest.fn(),
  onConflict: jest.fn(),
  merge: jest.fn(),
  returning: jest.fn(),
};
const trx = Object.assign(jest.fn(() => dbQuery), {
  fn: { now: jest.fn(() => "now") },
});
const db = Object.assign(jest.fn(), {
  transaction: jest.fn(async (callback) => callback(trx)),
});

jest.unstable_mockModule("../config/database.js", () => ({ default: db }));
jest.unstable_mockModule("../models/Notification.js", () => ({ default: {} }));
jest.unstable_mockModule("../models/NotificationPreference.js", () => ({ default: {} }));

const { default: DeviceToken } = await import("../models/DeviceToken.js");
const { unregisterDeviceToken } = await import("../controllers/notificationController.js");

describe("Device token ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dbQuery.insert.mockReturnValue(dbQuery);
    dbQuery.onConflict.mockReturnValue(dbQuery);
    dbQuery.merge.mockReturnValue(dbQuery);
    dbQuery.returning.mockResolvedValue([
      { id: 1, user_id: 2, token: "shared-token", platform: "ios", active: true },
    ]);
  });

  it("reassigns a token atomically through a unique-token upsert", async () => {
    const result = await DeviceToken.create({
      user_id: 2,
      token: "shared-token",
      platform: "ios",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(dbQuery.onConflict).toHaveBeenCalledWith("token");
    expect(dbQuery.merge).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 2, active: true, platform: "ios" }),
    );
    expect(result.user_id).toBe(2);

    await DeviceToken.create({
      user_id: 3,
      token: "shared-token",
      platform: "android",
    });
    expect(dbQuery.merge).toHaveBeenLastCalledWith(
      expect.objectContaining({ user_id: 3, active: true, platform: "android" }),
    );
  });

  it("only deactivates a token for its authenticated owner", async () => {
    const deactivate = jest.fn().mockResolvedValue(undefined);
    DeviceToken.deactivateByUserAndToken = deactivate;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await unregisterDeviceToken(
      { user: { id: 7 }, body: { token: "shared-token" } },
      res,
    );

    expect(deactivate).toHaveBeenCalledWith(7, "shared-token");
    expect(res.json).toHaveBeenCalledWith({ message: "Device token unregistered" });
  });

  it("returns the same success response for an unknown token", async () => {
    const deactivate = jest.fn().mockResolvedValue(undefined);
    DeviceToken.deactivateByUserAndToken = deactivate;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await unregisterDeviceToken(
      { user: { id: 8 }, body: { token: "missing-token" } },
      res,
    );

    expect(deactivate).toHaveBeenCalledWith(8, "missing-token");
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: "Device token unregistered" });
  });
});
