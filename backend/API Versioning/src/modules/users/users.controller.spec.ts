import { Test, TestingModule } from "@nestjs/testing";
import { UsersV1Controller } from "./controllers/users-v1.controller";
import { UsersV2Controller } from "./controllers/users-v2.controller";
import { UsersService } from "./users.service";

describe("Users Controllers", () => {
  let v1Controller: UsersV1Controller;
  let v2Controller: UsersV2Controller;
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersV1Controller, UsersV2Controller],
      providers: [UsersService],
    }).compile();

    v1Controller = module.get<UsersV1Controller>(UsersV1Controller);
    v2Controller = module.get<UsersV2Controller>(UsersV2Controller);
    service = module.get<UsersService>(UsersService);
  });

  describe("V1 Controller", () => {
    it("should return users in v1 format", () => {
      const result = v1Controller.findAll();
      expect(result.data).toBeDefined();
      expect(result.meta.version).toBe("v1");
      expect(result.meta.deprecated).toBe(true);
      expect(result.data[0]).toHaveProperty("name");
      expect(result.data[0]).not.toHaveProperty("firstName");
    });

    it("should include deprecation message", () => {
      const result = v1Controller.findAll();
      expect(result.meta.message).toContain("deprecated");
      expect(result.meta.message).toContain("v2");
    });
  });

  describe("V2 Controller", () => {
    it("should return users in v2 format", () => {
      const result = v2Controller.findAll();
      expect(result.data).toBeDefined();
      expect(result.meta.version).toBe("v2");
      expect(result.data[0]).toHaveProperty("firstName");
      expect(result.data[0]).toHaveProperty("lastName");
      expect(result.data[0]).toHaveProperty("createdAt");
    });

    it("should create user with v2 format", () => {
      const newUser = {
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
      };
      const result = v2Controller.create(newUser);
      expect(result.data).toHaveProperty("id");
      expect(result.data).toHaveProperty("createdAt");
      expect(result.data.firstName).toBe("Test");
    });
  });
});
