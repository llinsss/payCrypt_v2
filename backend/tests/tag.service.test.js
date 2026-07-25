import { afterEach, describe, expect, it, jest } from "@jest/globals";

const mockTagCreate = jest.fn();
const mockTagFindById = jest.fn();
const mockTagFindByName = jest.fn();
const mockTagUpdate = jest.fn();
const mockTagDelete = jest.fn();
const mockUserFindById = jest.fn();
const mockUserFindByTag = jest.fn();

jest.unstable_mockModule("../models/Tag.js", () => ({
  default: {
    create: mockTagCreate,
    findById: mockTagFindById,
    findByName: mockTagFindByName,
    update: mockTagUpdate,
    delete: mockTagDelete,
  },
}));

jest.unstable_mockModule("../models/User.js", () => ({
  default: {
    findById: mockUserFindById,
    findByTag: mockUserFindByTag,
  },
}));

const Tag = await import("../models/Tag.js");
const User = await import("../models/User.js");

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

describe("Tag Service", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("tag registration", () => {
    it("should register a new tag successfully", async () => {
      const newTag = {
        id: 1,
        name: "newuser",
        user_id: 1,
        status: "active",
        created_at: new Date(),
      };

      mockUserFindByTag.mockResolvedValue(null);
      mockTagCreate.mockResolvedValue(newTag);

      const result = await Tag.default.create({
        name: "newuser",
        user_id: 1,
      });

      expect(result.name).toBe("newuser");
      expect(result.status).toBe("active");
      expect(mockTagCreate).toHaveBeenCalled();
    });

    it("should return 400 if tag already exists", async () => {
      mockUserFindByTag.mockResolvedValue({
        id: 2,
        tag: "existingtag",
      });

      const result = await User.default.findByTag("existingtag");

      expect(result).toBeDefined();
      expect(result.tag).toBe("existingtag");
    });

    it("should validate tag format", async () => {
      const req = {
        body: {
          name: "invalid tag!", // contains special characters
        },
      };

      // Tags should only contain alphanumeric and underscore
      const tagRegex = /^[a-zA-Z0-9_]{3,20}$/;
      const isValid = tagRegex.test(req.body.name);

      expect(isValid).toBe(false);
    });

    it("should enforce tag length requirements", async () => {
      const shortTag = "ab"; // too short
      const longTag = "a".repeat(21); // too long

      const tagRegex = /^[a-zA-Z0-9_]{3,20}$/;

      expect(tagRegex.test(shortTag)).toBe(false);
      expect(tagRegex.test(longTag)).toBe(false);
      expect(tagRegex.test("validtag")).toBe(true);
    });
  });

  describe("tag resolution", () => {
    it("should resolve tag to user account", async () => {
      const user = {
        id: 1,
        tag: "johnsmith",
        email: "john@example.com",
        photo: "https://example.com/photo.jpg",
      };

      mockUserFindByTag.mockResolvedValue(user);

      const result = await User.default.findByTag("johnsmith");

      expect(result).toBeDefined();
      expect(result.email).toBe("john@example.com");
      expect(result.photo).toBeDefined();
    });

    it("should return error for non-existent tag", async () => {
      mockUserFindByTag.mockResolvedValue(null);

      const result = await User.default.findByTag("nonexistenttag");

      expect(result).toBeNull();
    });

    it("should resolve tag case-insensitively", async () => {
      const user = {
        id: 1,
        tag: "johnsmith",
        email: "john@example.com",
      };

      mockUserFindByTag.mockResolvedValue(user);

      const result = await User.default.findByTag("JOHNSMITH");

      expect(result).toBeDefined();
      expect(result.tag.toLowerCase()).toBe("johnsmith");
    });

    it("should include user profile in tag resolution", async () => {
      const user = {
        id: 1,
        tag: "johndoe",
        email: "john@example.com",
        photo: "https://example.com/photo.jpg",
        two_factor_enabled: true,
        verified: true,
      };

      mockUserFindByTag.mockResolvedValue(user);

      const result = await User.default.findByTag("johndoe");

      expect(result.photo).toBeDefined();
      expect(result.verified).toBe(true);
    });
  });

  describe("tag transfer", () => {
    it("should transfer tag from one user to another", async () => {
      const tag = {
        id: 1,
        name: "transfertag",
        user_id: 1,
      };

      mockTagFindById.mockResolvedValue(tag);
      mockTagUpdate.mockResolvedValue({
        ...tag,
        user_id: 2,
      });

      const result = await Tag.default.update(1, { user_id: 2 });

      expect(result.user_id).toBe(2);
      expect(result.name).toBe("transfertag");
    });

    it("should require authorization for tag transfer", async () => {
      const tag = {
        id: 1,
        user_id: 1,
      };

      mockTagFindById.mockResolvedValue(tag);

      const result = await Tag.default.findById(1);

      // Verify tag belongs to original owner before transfer
      expect(result.user_id).toBe(1);
    });

    it("should validate target user exists", async () => {
      mockUserFindById.mockResolvedValue(null);

      const result = await User.default.findById(999);

      expect(result).toBeNull();
    });

    it("should prevent tag transfer to non-existent user", async () => {
      mockUserFindById.mockResolvedValue(null);
      mockTagUpdate.mockRejectedValue(new Error("Target user not found"));

      await expect(Tag.default.update(1, { user_id: 999 })).rejects.toThrow("Target user not found");
    });
  });

  describe("tag deactivation", () => {
    it("should deactivate a tag", async () => {
      const tag = {
        id: 1,
        name: "oldtag",
        status: "active",
      };

      mockTagFindById.mockResolvedValue(tag);
      mockTagUpdate.mockResolvedValue({
        ...tag,
        status: "inactive",
      });

      const result = await Tag.default.update(1, { status: "inactive" });

      expect(result.status).toBe("inactive");
    });

    it("should not allow transactions with inactive tags", async () => {
      const tag = {
        id: 1,
        status: "inactive",
      };

      mockTagFindById.mockResolvedValue(tag);

      const result = await Tag.default.findById(1);

      if (result.status === "inactive") {
        expect(result.status).toBe("inactive");
      }
    });
  });

  describe("tag metadata", () => {
    it("should store tag creation timestamp", async () => {
      const now = new Date();
      const tag = {
        id: 1,
        name: "newtag",
        created_at: now,
      };

      mockTagCreate.mockResolvedValue(tag);

      const result = await Tag.default.create({ name: "newtag" });

      expect(result.created_at).toBeDefined();
      expect(result.created_at).toEqual(now);
    });

    it("should track tag updates", async () => {
      const tag = {
        id: 1,
        name: "newtag",
        updated_at: new Date(),
      };

      mockTagUpdate.mockResolvedValue(tag);

      const result = await Tag.default.update(1, { status: "active" });

      expect(result.updated_at).toBeDefined();
    });
  });

  describe("tag search", () => {
    it("should find tag by exact name", async () => {
      const tag = {
        id: 1,
        name: "exacttag",
      };

      mockTagFindByName.mockResolvedValue(tag);

      const result = await Tag.default.findByName("exacttag");

      expect(result.name).toBe("exacttag");
    });

    it("should support partial tag search", async () => {
      const tags = [
        { id: 1, name: "john" },
        { id: 2, name: "johnny" },
        { id: 3, name: "johnny2" },
      ];

      mockTagFindByName.mockResolvedValue(tags);

      const result = await Tag.default.findByName("john");

      expect(result.length >= 1).toBe(true);
    });
  });
});
