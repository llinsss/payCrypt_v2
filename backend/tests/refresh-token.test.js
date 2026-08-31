import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockUserFindById = jest.fn();
const mockRefreshTokenFindValidByHash = jest.fn();
const mockRefreshTokenFindByHash = jest.fn();
const mockRefreshTokenMarkAsUsed = jest.fn();
const mockRefreshTokenCreate = jest.fn();
const mockRefreshTokenHashToken = jest.fn();
const mockRefreshTokenRevokeAllByUserId = jest.fn();
const mockVerifyToken = jest.fn();
const mockSignToken = jest.fn();
const mockSignRefreshToken = jest.fn();

jest.unstable_mockModule("../models/User.js", () => ({
  default: {
    findById: mockUserFindById,
  },
}));

jest.unstable_mockModule("../models/RefreshToken.js", () => ({
  default: {
    findValidByHash: mockRefreshTokenFindValidByHash,
    findByHash: mockRefreshTokenFindByHash,
    markAsUsed: mockRefreshTokenMarkAsUsed,
    create: mockRefreshTokenCreate,
    hashToken: mockRefreshTokenHashToken,
    revokeAllByUserId: mockRefreshTokenRevokeAllByUserId,
  },
}));

jest.unstable_mockModule("../config/jwt.js", () => ({
  signToken: mockSignToken,
  signRefreshToken: mockSignRefreshToken,
  verifyToken: mockVerifyToken,
}));

const { refresh, logout } = await import("../controllers/authController.js");

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

describe("Refresh Token Service", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("refresh", () => {
    it("should issue new token pair on valid refresh", async () => {
      const userId = "user-123";
      const oldRefreshToken = "old-refresh-token";
      const tokenHash = "hashed-token";
      const newAccessToken = "new-access-token";
      const newRefreshToken = "new-refresh-token";

      mockVerifyToken.mockReturnValue({ userId, type: "refresh" });
      mockUserFindById.mockResolvedValue({ id: userId, email: "test@example.com" });
      mockRefreshTokenHashToken.mockResolvedValue(tokenHash);
      mockRefreshTokenFindValidByHash.mockResolvedValue({ id: 1, user_id: userId });
      mockRefreshTokenMarkAsUsed.mockResolvedValue(1);
      mockSignToken.mockReturnValue(newAccessToken);
      mockSignRefreshToken.mockReturnValue(newRefreshToken);
      mockRefreshTokenCreate.mockResolvedValue({ id: 2 });

      const req = {
        body: { refreshToken: oldRefreshToken },
        ip: "192.168.1.1",
        get: jest.fn().mockReturnValue("Mozilla/5.0"),
      };

      const res = mockResponse();
      await refresh(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.accessToken).toBe(newAccessToken);
      expect(res.body.refreshToken).toBe(newRefreshToken);
      expect(mockRefreshTokenMarkAsUsed).toHaveBeenCalled();
    });

    it("should reject refresh token that was already used (replay attack)", async () => {
      const userId = "user-123";
      const oldRefreshToken = "old-refresh-token";
      const tokenHash = "hashed-token";

      mockVerifyToken.mockReturnValue({ userId, type: "refresh" });
      mockUserFindById.mockResolvedValue({ id: userId });
      mockRefreshTokenHashToken.mockResolvedValue(tokenHash);
      mockRefreshTokenFindValidByHash.mockResolvedValue(null);
      mockRefreshTokenRevokeAllByUserId.mockResolvedValue(5);

      const req = {
        body: { refreshToken: oldRefreshToken },
        ip: "192.168.1.1",
        get: jest.fn().mockReturnValue("Mozilla/5.0"),
      };

      const res = mockResponse();
      await refresh(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain("All sessions have been revoked");
      expect(mockRefreshTokenRevokeAllByUserId).toHaveBeenCalledWith(userId);
    });

    it("should reject missing refresh token", async () => {
      const req = { body: {} };
      const res = mockResponse();

      await refresh(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain("Refresh token is required");
    });

    it("should reject non-refresh token type", async () => {
      mockVerifyToken.mockReturnValue({ userId: "user-123", type: "access" });

      const req = {
        body: { refreshToken: "access-token" },
        ip: "192.168.1.1",
        get: jest.fn().mockReturnValue("Mozilla/5.0"),
      };

      const res = mockResponse();
      await refresh(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toContain("not a refresh token");
    });
  });

  describe("logout", () => {
    it("should mark refresh token as used on logout", async () => {
      const userId = "user-123";
      const refreshToken = "refresh-token";
      const tokenHash = "hashed-token";

      mockRefreshTokenHashToken.mockResolvedValue(tokenHash);
      mockRefreshTokenFindByHash.mockResolvedValue({ id: 1 });
      mockRefreshTokenMarkAsUsed.mockResolvedValue(1);

      const req = {
        user: { id: userId },
        body: { refreshToken },
      };

      const res = mockResponse();
      await logout(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe("Logged out successfully");
      expect(mockRefreshTokenMarkAsUsed).toHaveBeenCalled();
    });

    it("should reject logout without authentication", async () => {
      const req = { body: {} };
      const res = mockResponse();

      await logout(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });
  });
});
