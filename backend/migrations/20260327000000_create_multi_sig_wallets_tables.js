export const up = async (knex) => {
  // Create multi-signature wallets table
  await knex.schema.createTable("multi_sig_wallets", (table) => {
    table.increments("id").primary();
    table.integer("owner_id").unsigned().notNullable();
    table.foreign("owner_id").references("id").inTable("users").onDelete("CASCADE");

    // Contract details
    table.string("contract_address", 255).unique();
    table.enum("blockchain_network", ["ethereum", "polygon", "starknet", "base", "arbitrum"]);

    // Wallet configuration
    table.integer("required_signatures").unsigned().notNullable();
    table.integer("total_signers").unsigned().notNullable();
    table.decimal("daily_limit", 32, 18).nullable();
    table.decimal("transaction_limit", 32, 18).nullable();

    // Metadata
    table.string("name", 255).nullable();
    table.text("description").nullable();
    table.enum("status", ["active", "inactive", "frozen"]).defaultTo("active");

    // Timestamps
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    // Indexes for common queries
    table.index("owner_id");
    table.index("status");
    table.index("contract_address");
  });

  // Create co-signers table
  await knex.schema.createTable("multi_sig_cosigners", (table) => {
    table.increments("id").primary();
    table.integer("wallet_id").unsigned().notNullable();
    table.foreign("wallet_id").references("id").inTable("multi_sig_wallets").onDelete("CASCADE");

    table.integer("user_id").unsigned().nullable();
    table.foreign("user_id").references("id").inTable("users").onDelete("SET NULL");

    // Co-signer details
    table.string("address", 255).notNullable(); // Stellar or EVM address
    table.string("name", 255).nullable();
    table.string("email", 255).nullable();
    table.enum("status", ["pending", "active", "revoked"]).defaultTo("pending");

    // Timestamps
    table.timestamp("added_at").defaultTo(knex.fn.now());
    table.timestamp("activated_at").nullable();
    table.timestamp("revoked_at").nullable();

    // Indexes
    table.index("wallet_id");
    table.index("user_id");
    table.index("address");
    table.unique(["wallet_id", "address"]);
  });

  // Create transaction proposals table
  await knex.schema.createTable("multi_sig_proposals", (table) => {
    table.increments("id").primary();
    table.integer("wallet_id").unsigned().notNullable();
    table.foreign("wallet_id").references("id").inTable("multi_sig_wallets").onDelete("CASCADE");

    table.integer("proposer_id").unsigned().notNullable();
    table.foreign("proposer_id").references("id").inTable("users").onDelete("CASCADE");

    // Transaction details
    table.string("to_address", 255).notNullable();
    table.decimal("amount", 32, 18).notNullable();
    table.string("token_symbol", 20).notNullable();
    table.text("data").nullable(); // Encoded transaction data for smart contracts
    table.string("description", 500).nullable();

    // Status tracking
    table.enum("status", ["pending", "approved", "rejected", "executed", "expired"]).defaultTo("pending");
    table.integer("approval_count").unsigned().defaultTo(0);
    table.string("tx_hash", 255).nullable(); // On-chain transaction hash after execution

    // Timestamps
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("executed_at").nullable();
    table.timestamp("expires_at").nullable();
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    // Indexes for common queries
    table.index("wallet_id");
    table.index("proposer_id");
    table.index("status");
    table.index("created_at");
  });

  // Create approvals table
  await knex.schema.createTable("multi_sig_approvals", (table) => {
    table.increments("id").primary();
    table.integer("proposal_id").unsigned().notNullable();
    table.foreign("proposal_id").references("id").inTable("multi_sig_proposals").onDelete("CASCADE");

    table.integer("approver_id").unsigned().notNullable();
    table.foreign("approver_id").references("id").inTable("users").onDelete("CASCADE");

    table.text("signature").notNullable(); // Digital signature from approver
    table.enum("decision", ["approve", "reject"]).notNullable();
    table.text("reason").nullable();

    // Timestamps
    table.timestamp("created_at").defaultTo(knex.fn.now());

    // Indexes and constraints
    table.index("proposal_id");
    table.index("approver_id");
    table.unique(["proposal_id", "approver_id"]); // One approval per proposer
  });

  // Create notifications index table for multi-sig events
  await knex.schema.createTable("multi_sig_notifications", (table) => {
    table.increments("id").primary();
    table.integer("user_id").unsigned().notNullable();
    table.foreign("user_id").references("id").inTable("users").onDelete("CASCADE");

    table.enum("event_type", [
      "proposal_created",
      "approval_requested",
      "approval_received",
      "approval_rejected",
      "transaction_executed",
      "wallet_threshold_changed",
      "cosigner_added",
      "cosigner_removed"
    ]).notNullable();

    table.integer("wallet_id").unsigned().nullable();
    table.foreign("wallet_id").references("id").inTable("multi_sig_wallets").onDelete("SET NULL");

    table.integer("proposal_id").unsigned().nullable();
    table.foreign("proposal_id").references("id").inTable("multi_sig_proposals").onDelete("SET NULL");

    table.text("message").notNullable();
    table.boolean("is_read").defaultTo(false);

    table.timestamp("created_at").defaultTo(knex.fn.now());

    // Indexes
    table.index("user_id");
    table.index("is_read");
  });
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists("multi_sig_notifications");
  await knex.schema.dropTableIfExists("multi_sig_approvals");
  await knex.schema.dropTableIfExists("multi_sig_proposals");
  await knex.schema.dropTableIfExists("multi_sig_cosigners");
  await knex.schema.dropTableIfExists("multi_sig_wallets");
};
