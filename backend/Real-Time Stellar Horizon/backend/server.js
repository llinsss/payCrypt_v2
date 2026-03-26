require('dotenv').config();
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const redis = require('./config/redis');
const SocketService = require('./services/SocketService');
const StellarStreamService = require('./services/StellarStreamService');

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

const server = http.createServer(app);
SocketService.init(server);

async function start() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/stellar_horizon');
  await redis.connect();

  const stellarStream = new StellarStreamService();
  await stellarStream.start();

  // Expose for dynamic address registration (e.g. after user signup)
  app.locals.stellarStream = stellarStream;

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => console.log(`[Server] Running on port ${PORT}`));

  process.on('SIGTERM', () => { stellarStream.stop(); server.close(); process.exit(0); });
  process.on('SIGINT', () => { stellarStream.stop(); server.close(); process.exit(0); });
}

start().catch((err) => { console.error('[Server] Fatal:', err); process.exit(1); });

module.exports = { app, server };
