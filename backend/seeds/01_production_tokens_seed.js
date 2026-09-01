/**
 * Production-safe seed: Core token definitions
 * These tokens are required for the system to function and contain
 * no demo/reference data. Safe to run in production.
 */
import { DEMO_TOKEN_SEEDS } from "../utils/demoSeedData.js";

export const seed = async (knex) => {
  for (const token of DEMO_TOKEN_SEEDS) {
    const { id, ...values } = token;
    await knex("tokens").insert({ id, ...values }).onConflict("id").merge(values);
  }
};
