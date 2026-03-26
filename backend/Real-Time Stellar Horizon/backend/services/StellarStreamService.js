const { Horizon } = require('@stellar/stellar-sdk');
const User = require('../models/User');
const Balance = require('../models/Balance');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const redis = require('../config/redis');

const CURSOR_KEY = 'stellar:stream:cursor';
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

class StellarStreamService {
  constructor(horizonUrl) {
    this.server = new Horizon.Server(horizonUrl || process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org');
    this.addressMap = new Map(); // stellarAddress -> userId
    this.stopFn = null;
    this.reconnectDelay = RECONNECT_BASE_MS;
    this.running = false;
  }

  async loadAddresses() {
    const users = await User.find({}, 'stellarAddress _id').lean();
    this.addressMap.clear();
    users.forEach(u => this.addressMap.set(u.stellarAddress, u._id));
  }

  registerAddress(stellarAddress, userId) {
    this.addressMap.set(stellarAddress, userId);
  }

  unregisterAddress(stellarAddress) {
    this.addressMap.delete(stellarAddress);
  }

  async start() {
    this.running = true;
    await this.loadAddresses();
    await this._connect();
  }

  stop() {
    this.running = false;
    if (this.stopFn) {
      this.stopFn();
      this.stopFn = null;
    }
  }

  async _getCursor() {
    const cursor = await redis.get(CURSOR_KEY);
    return cursor || 'now';
  }

  async _saveCursor(cursor) {
    await redis.set(CURSOR_KEY, cursor);
  }

  async _connect() {
    const cursor = await this._getCursor();
    console.log(`[StellarStream] Connecting with cursor: ${cursor}`);

    try {
      this.stopFn = this.server
        .payments()
        .cursor(cursor)
        .stream({
          onmessage: (payment) => this._handlePayment(payment),
          onerror: (err) => {
            console.error('[StellarStream] Stream error:', err.message || err);
            this._scheduleReconnect();
          }
        });

      this.reconnectDelay = RECONNECT_BASE_MS; // reset on successful connect
    } catch (err) {
      console.error('[StellarStream] Failed to connect:', err.message);
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (!this.running) return;
    if (this.stopFn) { this.stopFn(); this.stopFn = null; }

    console.log(`[StellarStream] Reconnecting in ${this.reconnectDelay}ms`);
    setTimeout(() => {
      if (this.running) this._connect();
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  async _handlePayment(payment) {
    if (payment.type !== 'payment') return;

    const userId = this.addressMap.get(payment.to);
    if (!userId) return;

    const amount = parseFloat(payment.amount);
    const asset = payment.asset_type === 'native' ? 'XLM' : payment.asset_code;
    const sender = payment.from;
    const memo = payment.transaction?.memo || null;
    const stellarTxHash = payment.transaction_hash;

    try {
      await Promise.all([
        Balance.credit(userId, amount),
        Transaction.create({
          userId,
          type: 'credit',
          status: 'completed',
          amount,
          asset,
          sender,
          memo,
          stellarTxHash
        }),
        Notification.create(
          userId,
          'Payment Received',
          `You received ${amount} ${asset} from ${sender.slice(0, 8)}...`
        )
      ]);

      await this._saveCursor(payment.paging_token);
      console.log(`[StellarStream] Credited ${amount} ${asset} to user ${userId}`);
    } catch (err) {
      console.error('[StellarStream] Error processing payment:', err.message);
    }
  }
}

module.exports = StellarStreamService;
