const { RpcProvider } = require('starknet');
const { ChainMonitorService } = require('../ChainMonitorService');

class StarknetMonitor extends ChainMonitorService {
  constructor(alertService) {
    super('starknet', alertService);
    this.provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });
  }

  async fetchPendingTransactions() {
    const keys = await this.redis.keys('monitor:starknet:tx:*');
    return keys.map(k => k.split(':').pop());
  }

  async fetchTransactionStatus(txHash) {
    const receipt = await this.provider.getTransactionReceipt(txHash);
    return {
      confirmed: receipt?.execution_status === 'SUCCEEDED',
      failed: receipt?.execution_status === 'REVERTED',
      receipt,
    };
  }

  // Starknet uses resource bounds, not gas price — return 0 to skip gas alerts
  async fetchGasPrice() { return 0; }

  async resubmitTransaction(_txHash) {
    // Starknet txs are account-signed; resubmission requires account context — log only
    throw new Error('Manual resubmission required for Starknet');
  }
}

module.exports = StarknetMonitor;
