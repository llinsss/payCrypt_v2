const axios = require('axios');
const { ChainMonitorService } = require('../ChainMonitorService');

class FlowMonitor extends ChainMonitorService {
  constructor(alertService) {
    super('flow', alertService);
    this.accessNode = process.env.FLOW_ACCESS_NODE || 'https://rest-mainnet.onflow.org';
  }

  async fetchPendingTransactions() {
    const keys = await this.redis.keys('monitor:flow:tx:*');
    return keys.map(k => k.split(':').pop());
  }

  async fetchTransactionStatus(txHash) {
    const { data } = await axios.get(`${this.accessNode}/v1/transaction_results/${txHash}`);
    const status = data?.status;
    return {
      confirmed: status === 'SEALED',
      failed: status === 'EXPIRED' || data?.error_message?.length > 0,
      data,
    };
  }

  // Flow uses computation fees, not gas price — return 0
  async fetchGasPrice() { return 0; }

  async resubmitTransaction(_txHash) {
    throw new Error('Flow transactions must be re-signed and resubmitted via FCL');
  }
}

module.exports = FlowMonitor;
