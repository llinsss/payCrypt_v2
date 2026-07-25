import { afterEach, describe, expect, it, jest } from "@jest/globals";

const mockGetByUser = jest.fn();
const mockFindById = jest.fn();
const mockUpdate = jest.fn();
const mockUserUpdate = jest.fn();
const mockNotificationCreate = jest.fn();

jest.unstable_mockModule("../models/Kyc.js", () => ({
  default: {
    getByUser: mockGetByUser,
    findById: mockFindById,
    update: mockUpdate,
  },
}));

jest.unstable_mockModule("../models/User.js", () => ({
  default: {
    update: mockUserUpdate,
  },
}));

jest.unstable_mockModule("../models/Notification.js", () => ({
  default: {
    create: mockNotificationCreate,
  },
}));

const { getKycByUser, getKycStatus, approveKyc, rejectKyc } =
  await import("../controllers/kycController.js");

function mockResponse() {
  const res = {};
  res.statusCode = 200;
  res.body = null;

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload) => {
    res.body = payload;
    return res;
  };

  return res;
}

afterEach(() => {
  mockGetByUser.mockReset();
  mockFindById.mockReset();
  mockUpdate.mockReset();
  mockUserUpdate.mockReset();
  mockNotificationCreate.mockReset();
});

describe("getKycByUser", () => {
  it("returns 400 when the authenticated user has no KYC records", async () => {
    mockGetByUser.mockResolvedValue([]);

    const req = { user: { id: 123 } };
    const res = mockResponse();

    await getKycByUser(req, res);

    expect(mockGetByUser).toHaveBeenCalledWith(123);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "No Kyc yet" });
  });
});

describe("getKycStatus", () => {
  it("returns the latest KYC status with rejection details when available", async () => {
    mockGetByUser.mockResolvedValue([
      {
        id: 10,
        status: "rejected",
        rejection_reason: "Document is blurry",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-02T00:00:00.000Z",
      },
    ]);

    const req = { user: { id: 123 } };
    const res = mockResponse();

    await getKycStatus(req, res);

    expect(mockGetByUser).toHaveBeenCalledWith(123);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      status: "rejected",
      kyc_status: "rejected",
      rejectionReason: "Document is blurry",
    });
  });
});

describe("approveKyc", () => {
  it("creates a notification when KYC is approved", async () => {
    mockFindById.mockResolvedValue({ id: 10, user_id: 123 });
    mockUpdate.mockResolvedValue({ id: 10 });
    mockUserUpdate.mockResolvedValue({ id: 123 });
    mockNotificationCreate.mockResolvedValue({ id: 55 });

    const req = { params: { id: 10 } };
    const res = mockResponse();

    await approveKyc(req, res);

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 123,
        title: "KYC approved",
        body: "Your identity verification has been approved. You can now continue using Tagged.",
        type: "security",
        channel: "push",
      }),
    );
    expect(res.statusCode).toBe(200);
  });
});
