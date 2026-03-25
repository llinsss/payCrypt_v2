import performanceService from "../services/PerformanceService.js";
import { getConnectionPoolStats } from "../utils/dbHealth.js";

export const getPerformanceMetrics = async (req, res) => {
  try {
    const metrics = await performanceService.getMetrics();
    const poolStats = getConnectionPoolStats();
    const data = { ...metrics, pool: poolStats };
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch performance metrics",
      error: error.message,
    });
  }
};

export const resetPerformanceMetrics = async (req, res) => {
  try {
    const result = await performanceService.resetMetrics();
    if (result.success) {
      res.status(200).json({
        success: true,
        message: "Performance metrics reset successfully"
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to reset performance metrics",
      error: error.message
    });
  }
};
