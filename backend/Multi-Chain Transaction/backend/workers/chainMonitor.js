require('dotenv').config();
const AlertService = require('../services/AlertService');
const StarknetMonitor = require('../services/monitors/StarknetMonitor');
const BaseMonitor = require('../services/monitors/BaseMonitor');
const FlowMonitor = require('../services/monitors/FlowMonitor');
const LiskMonitor = require('../services/monitors/LiskMonitor');
const U2UMonitor = require('../services/monitors/U2UMonitor');

const alertService = new AlertService();

const monitors = [
  new StarknetMonitor(alertService),
  new BaseMonitor(alertService),
  new FlowMonitor(alertService),
  new LiskMonitor(alertService),
  new U2UMonitor(alertService),
];

monitors.forEach(m => m.start());
console.log(`[chainMonitor] Started monitors for: ${monitors.map(m => m.chain).join(', ')}`);

const shutdown = () => {
  monitors.forEach(m => m.stop());
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
