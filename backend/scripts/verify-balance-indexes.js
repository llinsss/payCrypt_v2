import db from "../config/database.js";

const verifyIndexes = async () => {
  console.log("🔍 Verifying Balance Table Indexes...\n");

  try {
    // Get all indexes on the balances table
    const result = await db.raw(`
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'balances'
      ORDER BY indexname;
    `);

    const expectedIndexes = [
      "idx_balances_address",
      "idx_balances_token_id",
      "idx_balances_user_created",
      "idx_balances_user_token",
      "idx_balances_user_usd",
    ];

    console.log("📋 Current Indexes:");
    console.log("=".repeat(80));

    const foundIndexes = result.rows.map((row) => row.indexname);

    result.rows.forEach((row) => {
      const isExpected = expectedIndexes.includes(row.indexname);
      const icon = isExpected ? "✅" : "ℹ️";
      console.log(`${icon} ${row.indexname}`);
      console.log(`   ${row.indexdef}\n`);
    });

    // Check for missing indexes
    console.log("\n🔎 Index Verification:");
    console.log("=".repeat(80));

    const missingIndexes = expectedIndexes.filter(
      (idx) => !foundIndexes.includes(idx)
    );

    if (missingIndexes.length === 0) {
      console.log("✅ All expected indexes are present!");
    } else {
      console.log("⚠️  Missing indexes:");
      missingIndexes.forEach((idx) => {
        console.log(`   - ${idx}`);
      });
      console.log(
        "\n💡 Run migration to create missing indexes: npm run migrate"
      );
    }

    // Check index usage statistics
    console.log("\n📊 Index Usage Statistics:");
    console.log("=".repeat(80));

    const stats = await db.raw(`
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes
      WHERE tablename = 'balances'
      ORDER BY idx_scan DESC;
    `);

    if (stats.rows.length > 0) {
      stats.rows.forEach((row) => {
        console.log(`\n${row.indexname}:`);
        console.log(`  Scans: ${row.scans}`);
        console.log(`  Tuples Read: ${row.tuples_read}`);
        console.log(`  Tuples Fetched: ${row.tuples_fetched}`);
      });
    } else {
      console.log("No usage statistics available yet.");
    }

    // Table statistics
    console.log("\n📈 Table Statistics:");
    console.log("=".repeat(80));

    const tableStats = await db.raw(`
      SELECT
        n_live_tup as live_rows,
        n_dead_tup as dead_rows,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables
      WHERE relname = 'balances';
    `);

    if (tableStats.rows.length > 0) {
      const stats = tableStats.rows[0];
      console.log(`Live Rows: ${stats.live_rows}`);
      console.log(`Dead Rows: ${stats.dead_rows}`);
      console.log(`Last Vacuum: ${stats.last_vacuum || "Never"}`);
      console.log(`Last Analyze: ${stats.last_analyze || "Never"}`);

      if (stats.dead_rows > stats.live_rows * 0.1) {
        console.log(
          "\n⚠️  High dead row count. Consider running VACUUM ANALYZE."
        );
      }
    }

    console.log("\n✅ Verification complete!");
  } catch (error) {
    console.error("❌ Verification failed:", error.message);
    throw error;
  } finally {
    await db.destroy();
  }
};

verifyIndexes().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
