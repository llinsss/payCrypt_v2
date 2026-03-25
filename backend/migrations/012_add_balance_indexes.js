export const up = async (knex) => {
  await knex.schema.table("balances", (table) => {
    // Composite index for user_id + token_id lookups (most common query pattern)
    table.index(["user_id", "token_id"], "idx_balances_user_token");
    
    // Index for token_id (for JOIN optimization)
    table.index("token_id", "idx_balances_token_id");
    
    // Index for address lookups
    table.index("address", "idx_balances_address");
    
    // Composite index for user queries with sorting
    table.index(["user_id", "created_at"], "idx_balances_user_created");
    
    // Index for aggregation queries
    table.index(["user_id", "usd_value"], "idx_balances_user_usd");
  });
};

export const down = async (knex) => {
  await knex.schema.table("balances", (table) => {
    table.dropIndex(["user_id", "token_id"], "idx_balances_user_token");
    table.dropIndex("token_id", "idx_balances_token_id");
    table.dropIndex("address", "idx_balances_address");
    table.dropIndex(["user_id", "created_at"], "idx_balances_user_created");
    table.dropIndex(["user_id", "usd_value"], "idx_balances_user_usd");
  });
};
