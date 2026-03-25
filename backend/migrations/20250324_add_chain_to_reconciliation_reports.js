export const up = async (knex) => {
  await knex.schema.alterTable("reconciliation_reports", (table) => {
    // Which chain this report belongs to — null means Stellar (legacy rows)
    table.string("chain", 20).nullable().defaultTo(null);
    // Native token symbol for the chain (XLM, ETH, LSK, FLOW, U2U)
    table.string("native_symbol", 10).nullable().defaultTo(null);
    // Per-chain ERC-20 token breakdown stored as JSON
    table.text("token_breakdown").nullable().defaultTo(null);
  });

  // Index for filtering reports by chain
  await knex.schema.alterTable("reconciliation_reports", (table) => {
    table.index(["chain"], "idx_reconciliation_reports_chain");
  });
};

export const down = async (knex) => {
  await knex.schema.alterTable("reconciliation_reports", (table) => {
    table.dropIndex([], "idx_reconciliation_reports_chain");
    table.dropColumn("chain");
    table.dropColumn("native_symbol");
    table.dropColumn("token_breakdown");
  });
};
