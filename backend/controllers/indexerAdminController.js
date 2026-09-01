import redis from "../config/redis.js";

export const getIndexerStatus = async (req, res) => {
  try {
    const chains = ["base", "lisk", "flow", "u2u"];
    const status = {};

    for (const chain of chains) {
      const lastIndexedBlockKey = `indexer:lastBlock:${chain}`;
      const lastBlockStr = await redis.get(lastIndexedBlockKey);
      status[chain] = {
        lastIndexedBlock: lastBlockStr ? parseInt(lastBlockStr, 10) : null,
        status: lastBlockStr ? "active" : "pending",
      };
    }

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to get indexer status:", error);
    res.status(500).json({ error: error.message });
  }
};

export const resetIndexerBlock = async (req, res) => {
  try {
    const { chain } = req.params;

    if (!["base", "lisk", "flow", "u2u"].includes(chain)) {
      return res.status(400).json({ error: "Invalid chain" });
    }

    const lastIndexedBlockKey = `indexer:lastBlock:${chain}`;
    await redis.del(lastIndexedBlockKey);

    res.json({
      success: true,
      message: `Indexer block reset for ${chain}`,
    });
  } catch (error) {
    console.error("Failed to reset indexer:", error);
    res.status(500).json({ error: error.message });
  }
};
