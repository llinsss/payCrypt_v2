require('dotenv').config();
const express = require('express');
const monitoringRoutes = require('./routes/monitoring');

// Start chain monitors
require('./workers/chainMonitor');

const app = express();
app.use(express.json());
app.use('/monitoring', monitoringRoutes);

const PORT = process.env.METRICS_PORT || 9090;
app.listen(PORT, () => console.log(`[workers] Metrics API listening on :${PORT}`));

module.exports = app;
