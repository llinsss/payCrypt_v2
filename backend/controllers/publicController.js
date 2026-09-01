import db from "../config/database.js";
import redis from "../config/redis.js";

const STATS_CACHE_KEY = "platform:stats";
const STATS_TTL = 300; // 5 minutes in seconds

export const getPublicStats = async (req, res) => {
  try {
    // Try to get cached stats first
    const cachedStats = await redis.get(STATS_CACHE_KEY);
    if (cachedStats) {
      console.log("📊 Platform stats served from cache");
      return res.json({
        success: true,
        data: JSON.parse(cachedStats),
      });
    }

    console.log("🔄 Computing platform statistics...");

    // Compute fresh stats
    const stats = {};

    // Total transactions count
    try {
      const txResult = await db("transactions")
        .where("deleted_at", null)
        .count("* as count")
        .first();
      stats.totalTransactions = txResult?.count || 0;
      console.log(`✅ Total transactions: ${stats.totalTransactions}`);
    } catch (err) {
      console.error("❌ Error counting transactions:", err);
      stats.totalTransactions = 0;
    }

    // Total unique users
    try {
      const usersResult = await db("users")
        .count("id as count")
        .first();
      stats.totalUsers = usersResult?.count || 0;
      console.log(`✅ Total users: ${stats.totalUsers}`);
    } catch (err) {
      console.error("❌ Error counting users:", err);
      stats.totalUsers = 0;
    }

    // Total transaction volume (in USD)
    try {
      const volumeResult = await db("transactions")
        .where("deleted_at", null)
        .where("status", "completed")
        .sum("usd_value as total_volume")
        .first();
      stats.totalVolume = volumeResult?.total_volume || 0;
      stats.totalVolumeCurrency = "USD";
      console.log(`✅ Total volume: $${stats.totalVolume}`);
    } catch (err) {
      console.error("❌ Error calculating volume:", err);
      stats.totalVolume = 0;
      stats.totalVolumeCurrency = "USD";
    }

    // Supported chains (from chains table or hardcoded list)
    try {
      const chainsResult = await db("chains")
        .where("is_active", true)
        .select("name")
        .orderBy("name", "asc");
      stats.supportedChains = chainsResult.map(c => c.name.toLowerCase()) || [
        "stellar",
        "ethereum",
        "polygon",
      ];
      console.log(`✅ Supported chains: ${stats.supportedChains.join(", ")}`);
    } catch (err) {
      console.error("❌ Error fetching chains:", err);
      stats.supportedChains = ["stellar", "ethereum", "polygon"];
    }

    // Cache the stats
    await redis.setex(STATS_CACHE_KEY, STATS_TTL, JSON.stringify(stats));
    console.log("💾 Platform stats cached for 5 minutes");

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("❌ Error fetching platform statistics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch platform statistics",
    });
  }
};
