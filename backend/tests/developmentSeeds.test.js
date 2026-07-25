import { describe, expect, it } from "@jest/globals";
import { DEMO_CHAIN_SEEDS, DEMO_TOKEN_SEEDS, DEMO_USERS, DEMO_PASSWORD } from "../utils/demoSeedData.js";

describe("development seed definitions", () => {
  it("defines six supported chains and tokens", () => {
    expect(DEMO_CHAIN_SEEDS).toHaveLength(6);
    expect(DEMO_TOKEN_SEEDS).toHaveLength(6);
    expect(new Set(DEMO_CHAIN_SEEDS.map(({ id }) => id)).size).toBe(6);
    expect(new Set(DEMO_TOKEN_SEEDS.map(({ id }) => id)).size).toBe(6);
  });

  it("defines five safe-to-recognize development users and credentials", () => {
    expect(DEMO_USERS).toHaveLength(5);
    expect(DEMO_USERS.every(({ email, tag }) => email.endsWith(".local") && tag.startsWith("@demo_"))).toBe(true);
    expect(DEMO_PASSWORD).toMatch(/[A-Z]/);
    expect(DEMO_PASSWORD).toMatch(/[0-9]/);
    expect(DEMO_PASSWORD).toMatch(/[!@#$%^&*]/);
  });
});
