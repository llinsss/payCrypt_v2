/**
 * Production-safe seed: Core blockchain network definitions
 * These chains are required for the system to function and contain
 * no demo/reference data. Safe to run in production.
 */
import { DEMO_CHAIN_SEEDS } from "../utils/demoSeedData.js";

export const seed = async (knex) => {
  for (const chain of DEMO_CHAIN_SEEDS) {
    const { id, native_currency, ...chainValues } = chain;
    const values = { ...chainValues, native_currency: JSON.stringify(native_currency) };
    await knex("chains").insert({ id, ...values }).onConflict("id").merge(values);
  }
};
