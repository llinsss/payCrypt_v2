import AnalyticsService from "../services/AnalyticsService.js";

export const getTransactionVolume = async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    const data = await AnalyticsService.getTransactionVolume(period);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error in getTransactionVolume:", error);
    res.status(500).json({ success: false, error: "Failed to get transaction volume" });
  }
};

export const getAverageTransactionSize = async (req, res) => {
  try {
    const { period = 'all' } = req.query;
    const data = await AnalyticsService.getAverageTransactionSize(period);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error in getAverageTransactionSize:", error);
    res.status(500).json({ success: false, error: "Failed to get average transaction size" });
  }
};

export const getTransactionSuccessRate = async (req, res) => {
  try {
    const data = await AnalyticsService.getTransactionSuccessRate();
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error in getTransactionSuccessRate:", error);
    res.status(500).json({ success: false, error: "Failed to get transaction success rate" });
  }
};

export const getUserGrowth = async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    const data = await AnalyticsService.getUserGrowth(period);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error in getUserGrowth:", error);
    res.status(500).json({ success: false, error: "Failed to get user growth" });
  }
};

export const getTimeSeriesData = async (req, res) => {
  try {
    const { startDate, endDate, period = 'daily' } = req.query;
    const data = await AnalyticsService.getTimeSeriesData(startDate, endDate, period);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error in getTimeSeriesData:", error);
    res.status(500).json({ success: false, error: "Failed to get time series data" });
  }
};

export const getDashboardSummary = async (req, res) => {
  try {
    const data = await AnalyticsService.getDashboardSummary();
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error in getDashboardSummary:", error);
    res.status(500).json({ success: false, error: "Failed to get dashboard summary" });
  }
};
