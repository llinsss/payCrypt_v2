import { afterEach, describe, expect, it, jest } from "@jest/globals";

const mockGetByUser = jest.fn();

jest.unstable_mockModule("../models/Kyc.js", () => ({
  default: {
    getByUser: mockGetByUser,
  },
}));

jest.unstable_mockModule("../models/User.js", () => ({
  default: {},
}));

const { getKycByUser } = await import("../controllers/kycController.js");

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
