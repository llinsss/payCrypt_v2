import db from "../config/database.js";
import redis from "../config/redis.js";
import Balance from "../models/Balance.js";

// Benchmark utilities
const benchmark = async (name, fn, iterations = 100) => {
  const times = [];
  
  // Warm-up run
  await fn();
  
  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    await fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1_000_000); // Convert to milliseconds
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
  
  return { name, avg, min, max, median, iterations };
};

const printResults = (results) => {
  console.log("\n" + "=".repeat(80));
  console.log("BENCHMARK RESULTS");
  console.log("=".repeat(80));
  
  results.forEach((result) => {
    console.log(`\n${result.name}:`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Average:    ${result.avg.toFixed(2)}ms`);
    console.log(`  Median:     ${result.median.toFixed(2)}ms`);
    console.log(`  Min:        ${result.min.toFixed(2)}ms`);
    console.log(`  Max:        ${result.max.toFixed(2)}ms`);
  });
  
  console.log("\n" + "=".repeat(80));
};

const compareResults = (before, after) => {
  console.log("\n" + "=".repeat(80));
  console.log("PERFORMANCE COMPARISON");
  console.log("=".repeat(80));
  
  const improvement = ((before.avg - after.avg) / before.avg) * 100;
  const speedup = before.avg / after.avg;
  
  console.log(`\nAverage time improvement: ${improvement.toFixed(2)}%`);
  console.log(`Speedup factor: ${speedup.toFixed(2)}x`);
  console.log(`Time saved per query: ${(before.avg - after.avg).toFixed(2)}ms`);
  
  console.log("\n" + "=".repeat(80));
};

// Main benchmark function
const runBenchmarks = async () => {
  console.log("🚀 Starting Balance Query Benchmarks...\n");
  
  try {
    // Get test data
    const users = await db("users").limit(10);
    const tokens = await db("tokens").limit(5);
    const balances = await db("balances").limit(10);
    
    if (users.length === 0 || tokens.length === 0 || balances.length === 0) {
      console.error("❌ No test data found. Please seed the database first.");
      process.exit(1);
    }
    
    const testUserId = users[0].id;
    const testBalanceId = balances[0].id;
    const testTokenId = tokens[0].id;
    
    console.log(`Test Data:`);
    console.log(`  Users: ${users.length}`);
    console.log(`  Tokens: ${tokens.length}`);
    console.log(`  Balances: ${balances.length}`);
    console.log(`  Test User ID: ${testUserId}`);
    console.log(`  Test Balance ID: ${testBalanceId}`);
    
    const results = [];
    
    // 1. Test findById with cache
    console.log("\n📊 Benchmarking findById...");
    await redis.del(`balance:id:${testBalanceId}`); // Clear cache
    const findByIdCold = await benchmark(
      "findById (cold cache)",
      async () => await Balance.findById(testBalanceId),
      50
    );
    results.push(findByIdCold);
    
    const findByIdWarm = await benchmark(
      "findById (warm cache)",
      async () => await Balance.findById(testBalanceId),
      50
    );
    results.push(findByIdWarm);
    
    // 2. Test findByUserId with cache
    console.log("\n📊 Benchmarking findByUserId...");
    await redis.del(`balance:user:${testUserId}`); // Clear cache
    const findByUserCold = await benchmark(
      "findByUserId (cold cache)",
      async () => await Balance.findByUserId(testUserId),
      50
    );
    results.push(findByUserCold);
    
    const findByUserWarm = await benchmark(
      "findByUserId (warm cache)",
      async () => await Balance.findByUserId(testUserId),
      50
    );
    results.push(findByUserWarm);
    
    // 3. Test findByUserIdAndTokenId with cache
    console.log("\n📊 Benchmarking findByUserIdAndTokenId...");
    await redis.del(`balance:user:${testUserId}:token:${testTokenId}`); // Clear cache
    const findByUserTokenCold = await benchmark(
      "findByUserIdAndTokenId (cold cache)",
      async () => await Balance.findByUserIdAndTokenId(testUserId, testTokenId),
      50
    );
    results.push(findByUserTokenCold);
    
    const findByUserTokenWarm = await benchmark(
      "findByUserIdAndTokenId (warm cache)",
      async () => await Balance.findByUserIdAndTokenId(testUserId, testTokenId),
      50
    );
    results.push(findByUserTokenWarm);
    
    // 4. Test getByUser with pagination
    console.log("\n📊 Benchmarking getByUser...");
    const getByUser = await benchmark(
      "getByUser (with pagination)",
      async () => await Balance.getByUser(testUserId, 10, 0),
      50
    );
    results.push(getByUser);
    
    // 5. Test totalBalanceByUser
    console.log("\n📊 Benchmarking totalBalanceByUser...");
    await redis.del(`balance:total:user:${testUserId}`); // Clear cache
    const totalBalanceCold = await benchmark(
      "totalBalanceByUser (cold cache)",
      async () => await Balance.totalBalanceByUser(testUserId),
      50
    );
    results.push(totalBalanceCold);
    
    const totalBalanceWarm = await benchmark(
      "totalBalanceByUser (warm cache)",
      async () => await Balance.totalBalanceByUser(testUserId),
      50
    );
    results.push(totalBalanceWarm);
    
    // 6. Test JOIN query performance
    console.log("\n📊 Benchmarking JOIN queries...");
    const joinQuery = await benchmark(
      "Complex JOIN query (findById)",
      async () => {
        await db("balances")
          .select(
            "balances.*",
            "users.email",
            "users.tag",
            "tokens.name",
            "tokens.symbol"
          )
          .leftJoin("users", "balances.user_id", "users.id")
          .leftJoin("tokens", "balances.token_id", "tokens.id")
          .where("balances.id", testBalanceId)
          .first();
      },
      50
    );
    results.push(joinQuery);
    
    // Print all results
    printResults(results);
    
    // Compare cache performance
    console.log("\n📈 CACHE PERFORMANCE ANALYSIS");
    console.log("=".repeat(80));
    
    console.log("\n1. findById:");
    compareResults(findByIdCold, findByIdWarm);
    
    console.log("\n2. findByUserId:");
    compareResults(findByUserCold, findByUserWarm);
    
    console.log("\n3. findByUserIdAndTokenId:");
    compareResults(findByUserTokenCold, findByUserTokenWarm);
    
    console.log("\n4. totalBalanceByUser:");
    compareResults(totalBalanceCold, totalBalanceWarm);
    
    // Index effectiveness test
    console.log("\n📊 INDEX EFFECTIVENESS TEST");
    console.log("=".repeat(80));
    
    // Check if indexes exist
    const indexes = await db.raw(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE tablename = 'balances'
      ORDER BY indexname;
    `);
    
    console.log("\nCurrent indexes on 'balances' table:");
    indexes.rows.forEach((idx) => {
      console.log(`  - ${idx.indexname}`);
    });
    
    // Query plan analysis
    console.log("\n📋 QUERY PLAN ANALYSIS");
    console.log("=".repeat(80));
    
    const explainQuery = await db.raw(`
      EXPLAIN ANALYZE
      SELECT balances.*, users.email, tokens.symbol
      FROM balances
      LEFT JOIN users ON balances.user_id = users.id
      LEFT JOIN tokens ON balances.token_id = tokens.id
      WHERE balances.user_id = ?
      ORDER BY balances.created_at DESC
      LIMIT 10;
    `, [testUserId]);
    
    console.log("\nQuery plan for getByUser:");
    explainQuery.rows.forEach((row) => {
      console.log(`  ${row["QUERY PLAN"]}`);
    });
    
    console.log("\n✅ Benchmark completed successfully!");
    
  } catch (error) {
    console.error("❌ Benchmark failed:", error);
    throw error;
  } finally {
    await db.destroy();
    await redis.quit();
  }
};

// Run benchmarks
runBenchmarks().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
