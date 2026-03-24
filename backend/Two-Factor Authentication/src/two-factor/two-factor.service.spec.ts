import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TwoFactorService } from "./two-factor.service";
import { User } from "../entities/user.entity";
import * as bcrypt from "bcrypt";
import * as speakeasy from "speakeasy";

describe("TwoFactorService", () => {
  let service: TwoFactorService;
  let userRepository: Repository<User>;

  const mockUser: Partial<User> = {
    id: "123",
    email: "test@example.com",
    password: "$2b$10$hashedpassword",
    twoFactorSecret: "JBSWY3DPEHPK3PXP",
    twoFactorEnabled: false,
    backupCodes: [],
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("generateSecret", () => {
    it("should generate TOTP secret and QR code", async () => {
      mockUserRepository.update.mockResolvedValue({});

      const result = await service.generateSecret("123", "test@example.com");

      expect(result).toHaveProperty("secret");
      expect(result).toHaveProperty("qrCode");
      expect(result.qrCode).toContain("data:image/png;base64");
      expect(mockUserRepository.update).toHaveBeenCalledWith("123", {
        twoFactorSecret: expect.any(String),
      });
    });
  });

  describe("verifyToken", () => {
    it("should verify valid TOTP token", () => {
      const secret = speakeasy.generateSecret();
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: "base32",
      });

      const result = service.verifyToken(secret.base32, token);

      expect(result).toBe(true);
    });

    it("should reject invalid TOTP token", () => {
      const secret = speakeasy.generateSecret();
      const result = service.verifyToken(secret.base32, "000000");

      expect(result).toBe(false);
    });
  });

  describe("enable2FA", () => {
    it("should enable 2FA with valid credentials", async () => {
      const secret = speakeasy.generateSecret();
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: "base32",
      });

      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        twoFactorSecret: secret.base32,
      });
      jest.spyOn(bcrypt, "compare").mockResolvedValue(true as never);
      jest.spyOn(bcrypt, "hash").mockResolvedValue("hashedcode" as never);

      const result = await service.enable2FA("123", "password", token);

      expect(result).toHaveProperty("backupCodes");
      expect(result.backupCodes).toHaveLength(10);
      expect(mockUserRepository.update).toHaveBeenCalledWith("123", {
        twoFactorEnabled: true,
        twoFactorEnabledAt: expect.any(Date),
        backupCodes: expect.any(Array),
      });
    });

    it("should throw error with invalid password", async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, "compare").mockResolvedValue(false as never);

      await expect(
        service.enable2FA("123", "wrongpassword", "123456"),
      ).rejects.toThrow("Invalid password");
    });
  });

  describe("verifyBackupCode", () => {
    it("should verify and consume backup code", async () => {
      const hashedCode = await bcrypt.hash("ABCD1234", 10);
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        backupCodes: [hashedCode],
      });

      const result = await service.verifyBackupCode("123", "ABCD1234");

      expect(result).toBe(true);
      expect(mockUserRepository.update).toHaveBeenCalledWith("123", {
        backupCodes: [],
      });
    });

    it("should reject invalid backup code", async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        backupCodes: [await bcrypt.hash("ABCD1234", 10)],
      });

      const result = await service.verifyBackupCode("123", "WRONG123");

      expect(result).toBe(false);
    });
  });

  describe("disable2FA", () => {
    it("should disable 2FA with valid credentials", async () => {
      const secret = speakeasy.generateSecret();
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: "base32",
      });

      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        twoFactorSecret: secret.base32,
        twoFactorEnabled: true,
      });
      jest.spyOn(bcrypt, "compare").mockResolvedValue(true as never);

      const result = await service.disable2FA("123", "password", token);

      expect(result.message).toBe("2FA disabled successfully");
      expect(mockUserRepository.update).toHaveBeenCalledWith("123", {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: null,
        twoFactorEnabledAt: null,
      });
    });
  });

  describe("regenerateBackupCodes", () => {
    it("should generate new backup codes", async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        twoFactorEnabled: true,
      });
      jest.spyOn(bcrypt, "compare").mockResolvedValue(true as never);
      jest.spyOn(bcrypt, "hash").mockResolvedValue("hashedcode" as never);

      const result = await service.regenerateBackupCodes("123", "password");

      expect(result.backupCodes).toHaveLength(10);
      expect(mockUserRepository.update).toHaveBeenCalledWith("123", {
        backupCodes: expect.any(Array),
      });
    });
  });
});
