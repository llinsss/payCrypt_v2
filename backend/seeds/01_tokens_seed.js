import { DEMO_TOKEN_SEEDS } from "../utils/demoSeedData.js";

export const seed = async (knex) => {
  for (const token of DEMO_TOKEN_SEEDS) {
    const { id, ...values } = token;
    await knex("tokens").insert({ id, ...values }).onConflict("id").merge(values);
  }
};
