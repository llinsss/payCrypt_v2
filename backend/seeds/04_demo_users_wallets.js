import bcrypt from "bcrypt";
import { DEMO_PASSWORD, DEMO_USERS, DEMO_TOKEN_SEEDS } from "../utils/demoSeedData.js";

export const seed = async (knex) => {
  const password = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const demoUser of DEMO_USERS) {
    let user = await knex("users").where({ email: demoUser.email }).first();
    if (!user) {
      const [id] = await knex("users").insert({ ...demoUser, password }).returning("id");
      user = { id: typeof id === "object" ? id.id : id, ...demoUser };
    }

    const wallet = await knex("wallets").where({ user_id: user.id }).first();
    if (!wallet) {
      await knex("wallets").insert({ user_id: user.id, available_balance: 1000, locked_balance: 0 });
    }

    for (const token of DEMO_TOKEN_SEEDS) {
      const balance = await knex("balances").where({ user_id: user.id, token_id: token.id }).first();
      if (!balance) {
        await knex("balances").insert({
          user_id: user.id,
          token_id: token.id,
          amount: 100 + token.id,
          usd_value: (100 + token.id) * token.price,
          address: demoUser.address,
        });
      }
    }
  }
};
