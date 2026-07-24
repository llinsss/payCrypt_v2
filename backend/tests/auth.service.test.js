import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockUserCreate = jest.fn();
const mockUserFindByEmail = jest.fn();
const mockUserVerifyPassword = jest.fn();
const mockUserUpdate = jest.fn();
const mockWalletCreate = jest.fn();
const mockBankAccountCreate = jest.fn();
const mockBalanceQueueAdd = jest.fn();
const mockSignToken = jest.fn();

jest.unstable_mockModule("../models/User.js", () => ({
  default: {
    create: mockUserCreate,
    findByEmail: mockUserFindByEmail,
    findByTag: jest.fn().mockResolvedValue(null),
    verifyPassword: mockUserVerifyPassword,
    update: mockUserUpdate,
  },
}));

jest.unstable_mockModule("../models/Wallet.js", () => ({
  default: {
    create: mockWalletCreate,
  },
}));

jest.unstable_mockModule("../models/BankAccount.js", () => ({
  default: {
    create: mockBankAccountCreate,
  },
}));

jest.unstable_mockModule("../queues/balance.js", () => ({
  balanceQueue: {
    add: mockBalanceQueueAdd,
  },
}));

jest.unstable_mockModule("../config/jwt.js", () => ({
  signToken: mockSignToken,
}));

const { register, login } = await import("../controllers/authController.js");

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

describe("Auth Service", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("register", () => {
    it("should successfully register a new user", async () => {
      const newUser = {
        id: 1,
        email: "test@example.com",
        tag: "testuser",
        address: "123 Main St",
        role: "user",
      };

      mockUserFindByEmail.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue(newUser);
      mockSignToken.mockReturnValue("jwt-token-123");
      mockWalletCreate.mockResolvedValue({ id: 1 });
      mockBankAccountCreate.mockResolvedValue({ id: 1 });
      mockBalanceQueueAdd.mockResolvedValue({ id: 1 });

      const req = {
        body: {
          email: "test@example.com",
          tag: "testuser",
          address: "123 Main St",
          password: "securepassword123",
          role: "user",
        },
      };

      const res = mockResponse();
      await register(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.body.token).toBe("jwt-token-123");
      expect(res.body.message).toBe("User registered successfully");
      expect(mockUserCreate).toHaveBeenCalled();
      expect(mockWalletCreate).toHaveBeenCalled();
      expect(mockBankAccountCreate).toHaveBeenCalled();
      expect(mockBalanceQueueAdd).toHaveBeenCalled();
    });

    it("should return 400 if email already exists", async () => {
      mockUserFindByEmail.mockResolvedValue({ id: 1, email: "test@example.com" });

      const req = {
        body: {
          email: "test@example.com",
          tag: "testuser",
          password: "securepassword123",
        },
      };

      const res = mockResponse();
      await register(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe("User email already exists");
    });

    it("should return 500 on registration error", async () => {
      mockUserFindByEmail.mockResolvedValue(null);
      mockUserCreate.mockRejectedValue(new Error("Database error"));

      const req = {
        body: {
          email: "test@example.com",
          tag: "testuser",
          password: "securepassword123",
        },
      };

      const res = mockResponse();
      await register(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });

  describe("login", () => {
    it("should successfully login a valid user", async () => {
      const user = {
        id: 1,
        email: "test@example.com",
        password: "hashed-password",
        tag: "testuser",
      };

      mockUserFindByEmail.mockResolvedValue(user);
      mockUserVerifyPassword.mockResolvedValue(true);
      mockSignToken.mockReturnValue("jwt-token-123");
      mockUserUpdate.mockResolvedValue({ ...user, last_login: new Date() });

      const req = {
        body: {
          email: "test@example.com",
          password: "securepassword123",
        },
      };

      const res = mockResponse();
      await login(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.token).toBe("jwt-token-123");
      expect(res.body.message).toBe("Login successful");
      expect(mockSignToken).toHaveBeenCalledWith({ userId: 1 });
      expect(mockUserUpdate).toHaveBeenCalledWith(1, { last_login: expect.any(Date) });
    });

    it("should return 400 for non-existent user", async () => {
      mockUserFindByEmail.mockResolvedValue(null);

      const req = {
        body: {
          email: "nonexistent@example.com",
          password: "securepassword123",
        },
      };

      const res = mockResponse();
      await login(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe("Invalid credentials");
    });

    it("should return 400 for invalid password", async () => {
      const user = {
        id: 1,
        email: "test@example.com",
        password: "hashed-password",
      };

      mockUserFindByEmail.mockResolvedValue(user);
      mockUserVerifyPassword.mockResolvedValue(false);

      const req = {
        body: {
          email: "test@example.com",
          password: "wrongpassword",
        },
      };

      const res = mockResponse();
      await login(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe("Invalid credentials");
    });

    it("should update last_login timestamp", async () => {
      const user = {
        id: 1,
        email: "test@example.com",
        password: "hashed-password",
      };

      mockUserFindByEmail.mockResolvedValue(user);
      mockUserVerifyPassword.mockResolvedValue(true);
      mockSignToken.mockReturnValue("jwt-token-123");
      mockUserUpdate.mockResolvedValue({ ...user, last_login: new Date() });

      const req = {
        body: {
          email: "test@example.com",
          password: "securepassword123",
        },
      };

      const res = mockResponse();
      await login(req, res);

      expect(mockUserUpdate).toHaveBeenCalledWith(1, expect.objectContaining({
        last_login: expect.any(Date),
      }));
    });
  });
});
