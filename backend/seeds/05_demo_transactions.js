/**
 * Demo-only seed: Demo transaction and scheduled payment data
 * Creates sample transactions and scheduled payments for development and testing.
 * DO NOT use in production.
 */
import { DEMO_USERS, DEMO_TOKEN_SEEDS } from "../utils/demoSeedData.js";

export const seed = async (knex) => {
  const users = await knex("users").whereIn("email", DEMO_USERS.map(({ email }) => email));
  const byEmail = new Map(users.map((user) => [user.email, user]));
  const now = Date.now();

  for (let index = 0; index < 50; index++) {
    const sender = DEMO_USERS[index % DEMO_USERS.length];
    const recipient = DEMO_USERS[(index + 1) % DEMO_USERS.length];
    const token = DEMO_TOKEN_SEEDS[index % DEMO_TOKEN_SEEDS.length];
    const reference = `demo-tx-${String(index + 1).padStart(2, "0")}`;
    const senderUser = byEmail.get(sender.email);
    const exists = await knex("transactions").where({ reference }).first();

    if (!exists) {
      await knex("transactions").insert({
        user_id: senderUser.id,
        token_id: token.id,
        chain_id: token.id,
        reference,
        type: index % 3 === 0 ? "credit" : "debit",
        status: index % 11 === 0 ? "pending" : index % 13 === 0 ? "failed" : "completed",
        tx_hash: `0xdemo${String(index + 1).padStart(60, "0")}`,
        usd_value: (index + 1) * 12.5,
        amount: (index + 1) * 0.25,
        timestamp: new Date(now - index * 86_400_000).toISOString(),
        from_address: senderUser.address,
        to_address: byEmail.get(recipient.email).address,
        description: `Development demo transfer ${index + 1}`,
        extra: JSON.stringify({ source: "development-seed", recipient: recipient.tag }),
      });
    }
  }

  for (let index = 0; index < DEMO_USERS.length; index++) {
    const sender = DEMO_USERS[index];
    const recipient = DEMO_USERS[(index + 2) % DEMO_USERS.length];
    const user = byEmail.get(sender.email);
    const memo = `demo-schedule-${index + 1}`;
    const exists = await knex("scheduled_payments").where({ user_id: user.id, memo }).first();

    if (!exists) {
      await knex("scheduled_payments").insert({
        user_id: user.id,
        sender_tag: sender.tag,
        recipient_tag: recipient.tag,
        amount: (index + 1) * 5,
        asset: "XLM",
        memo,
        scheduled_at: new Date(now + (index + 1) * 86_400_000),
        status: "pending",
      });
    }
  }
};
