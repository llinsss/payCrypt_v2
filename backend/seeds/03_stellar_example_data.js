/**
 * Seed file for Stellar SDK example data
 * This creates sample tags and accounts for testing
 */
export const seed = async (knex) => {
  // Check if stellar_tags table has data
  const tagsResult = await knex("stellar_tags").count("* as count");
  const tagsCount = Number(tagsResult[0].count);

  // Only seed if table is empty
  if (tagsCount === 0) {
    // Insert example stellar tags
    await knex("stellar_tags").insert([
      {
        tag: "@stellar_demo",
        stellar_address: "GDMTPCGZXQKOCDCB2YGFZYZKFEJDMKFGA4F4UCKCODVSXGMIBUWLBCTW",
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      },
      {
        tag: "@test_account",
        stellar_address: "GDCAD62OOVRVJTRXELXYKUAUF7C3NG4D6T6L2TUKRCQMMSCKYF45IVO6",
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      },
    ]);

    console.log("✓ Seeded stellar_tags with example data");
  }

  // Check if stellar_accounts table has data
  const accountsResult = await knex("stellar_accounts").count("* as count");
  const accountsCount = Number(accountsResult[0].count);

  if (accountsCount === 0) {
    // Insert example stellar accounts
    await knex("stellar_accounts").insert([
      {
        stellar_address: "GDMTPCGZXQKOCDCB2YGFZYZKFEJDMKFGA4F4UCKCODVSXGMIBUWLBCTW",
        public_key: "GDMTPCGZXQKOCDCB2YGFZYZKFEJDMKFGA4F4UCKCODVSXGMIBUWLBCTW",
        account_type: "standard",
        xlm_balance: 1000.0,
        sequence_number: 123456,
        signers: JSON.stringify([]),
        balances: JSON.stringify([
          { asset_code: "XLM", balance: "1000.0000000" },
        ]),
        thresholds: JSON.stringify({ low: 0, medium: 0, high: 0 }),
        flags: JSON.stringify({ auth_required: false, auth_revocable: false }),
        subentry_count: 0,
        is_active: true,
        last_synced_at: knex.fn.now(),
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      },
    ]);

    console.log("✓ Seeded stellar_accounts with example data");
  }
};
