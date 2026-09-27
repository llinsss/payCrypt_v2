export class FeeEstimationService {
  constructor({ updateInterval = 60 * 1000 } = {}) {
    this.fees = {
      slow: null,
      normal: null,
      fast: null
    };
    this.lastUpdated = null;
    this.updateInterval = updateInterval; // 1 minute by default
    this.timer = null;
  }

  /**
   * Starts the periodic fetching of network fees. Calling it again while
   * already started is a no-op. The timer is unref'd so it never keeps the
   * process alive on its own.
   * @returns {boolean} true if updates were started, false if already running
   */
  start() {
    if (this.timer) return false;

    // Initial fetch
    this.updateEstimates();

    this.timer = setInterval(() => {
      this.updateEstimates();
    }, this.updateInterval);
    this.timer.unref?.();
    return true;
  }

  /**
   * Stops the periodic updates and releases the timer handle.
   */
  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  isRunning() {
    return this.timer !== null;
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
      const timeout = setTimeout(() => {
        // Mock data logic for generating simulated fees (e.g., in Gwei)
        const baseFee = Math.floor(Math.random() * 15) + 15; // 15 to 30
        resolve({
          slow: baseFee,
          normal: Math.floor(baseFee * 1.2),
          fast: Math.floor(baseFee * 1.5)
        });
      }, 300);
      timeout.unref?.();
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

// Export as a singleton so the same cache is used throughout the application.
// Call start() to begin periodic updates and stop() on shutdown.
export default new FeeEstimationService();
