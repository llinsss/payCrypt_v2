class FeeEstimationService {
  constructor() {
    this.fees = {
      slow: null,
      normal: null,
      fast: null
    };
    this.lastUpdated = null;
    this.updateInterval = 60 * 1000; // 1 minute
    
    // Start the periodic update
    this.startPeriodicUpdates();
  }

  /**
   * Starts the periodic fetching of network fees
   */
  startPeriodicUpdates() {
    // Initial fetch
    this.updateEstimates();
    
    // Set interval for periodic updates
    setInterval(() => {
      this.updateEstimates();
    }, this.updateInterval);
  }

  /**
   * Queries the current network fees and caches them
   */
  async updateEstimates() {
    try {
      const currentFees = await this.queryNetworkFees();
      
      this.fees = {
        slow: currentFees.slow,
        normal: currentFees.normal,
        fast: currentFees.fast
      };
      
      this.lastUpdated = new Date();
      console.log('Fee estimates updated successfully:', this.fees);
    } catch (error) {
      console.error('Error updating fee estimates:', error.message);
    }
  }

  /**
   * Simulates querying an external API or node for current gas/network fees.
   * In a real application, replace this mock with an actual provider or API call.
   * @returns {Promise<Object>} Object containing different fee tiers
   */
  async queryNetworkFees() {
    // Example integration:
    // const response = await axios.get('https://ethgasstation.info/api/ethgasAPI.json');
    // return { slow: response.data.safeLow, normal: response.data.average, fast: response.data.fast };
    
    return new Promise((resolve) => {
      // Simulating network response delay
      setTimeout(() => {
        // Mock data logic for generating simulated fees (e.g., in Gwei)
        const baseFee = Math.floor(Math.random() * 15) + 15; // 15 to 30
        resolve({
          slow: baseFee,
          normal: Math.floor(baseFee * 1.2),
          fast: Math.floor(baseFee * 1.5)
        });
      }, 300);
    });
  }

  /**
   * Returns the cached fee estimates
   * @returns {Object} Cached fee tiers and last updated timestamp
   */
  getEstimates() {
    if (!this.lastUpdated) {
      return {
        error: 'Fee estimates are currently unavailable or still being calculated.',
        fees: null,
        lastUpdated: null
      };
    }

    return {
      fees: this.fees,
      lastUpdated: this.lastUpdated
    };
  }
}

// Export as a singleton so the same cache is used throughout the application
module.exports = new FeeEstimationService();
