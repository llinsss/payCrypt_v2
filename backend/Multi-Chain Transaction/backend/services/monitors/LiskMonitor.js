const { ethers } = require('ethers');
const { ChainMonitorService } = require('../ChainMonitorService');

class LiskMonitor extends ChainMonitorService {
  constructor(alertService) {
    super('lisk', alertService);
    this.provider = new ethers.JsonRpcProvider(process.env.LISK_RPC_URL);
  }

  async fetchPendingTransactions() {
    const keys = await this.redis.keys('monitor:lisk:tx:*');
    return keys.map(k => k.split(':').pop());
  }

  async fetchTransactionStatus(txHash) {
    const receipt = await this.provider.getTransactionReceipt(txHash);
    if (!receipt) return { confirmed: false, failed: false };
    return { confirmed: receipt.status === 1, failed: receipt.status === 0, receipt };
  }

  async fetchGasPrice() {
    const feeData = await this.provider.getFeeData();
    return parseFloat(ethers.formatUnits(feeData.gasPrice || 0n, 'gwei'));
  }

  async resubmitTransaction(_txHash) {
    throw new Error('Resubmission requires signer — handle at application layer');
  }
}

module.exports = LiskMonitor;
