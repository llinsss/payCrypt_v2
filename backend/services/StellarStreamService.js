import { Server } from '@stellar/stellar-sdk';
import redis from '../config/redis.js';
import db from '../config/database.js';
import Transaction from '../models/Transaction.js';
import Balance from '../models/Balance.js';
import StellarStreamCursor from '../models/StellarStreamCursor.js';
import WebhookService, { WEBHOOK_EVENTS } from './WebhookService.js';
import logger from '../utils/logger.js';

const STREAM_CURSOR_KEY = 'stellar:stream:cursor';
const STREAM_STATUS_KEY = 'stellar:stream:status';
const STREAM_ADDRESSES_KEY = 'stellar:stream:addresses';

const RECONNECT_CONFIG = {
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  maxAttempts: Infinity,
};

class StellarStreamService {
  constructor() {
    const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
    this.server = new Server(horizonUrl);
    this.running = false;
    this.stopFn = null;
    this.reconnectDelay = RECONNECT_CONFIG.baseDelayMs;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.lastProcessedCursor = null;
    this.subscribedAddresses = new Map();
    this.status = {
      running: false,
      connected: false,
      lastHeartbeat: null,
      lastProcessedCursor: null,
      errorCount: 0,
      lastError: null,
      startedAt: null,
    };
  }

  getHorizonUrl() {
    return this.server.serverURL?.toString() || process.env.STELLAR_HORIZON_URL;
  }

  async loadAddresses() {
    try {
      const accounts = await db('stellar_accounts')
        .select('stellar_accounts.stellar_address', 'stellar_accounts.user_id', 'users.tag')
        .leftJoin('users', 'stellar_accounts.user_id', 'users.id')
        .where(function() {
          this.where('stellar_accounts.is_active', true);
          this.andWhere(function() {
            this.whereNull('stellar_accounts.stream_enabled');
            this.orWhere('stellar_accounts.stream_enabled', true);
          });
        });

      this.subscribedAddresses.clear();
      
      for (const account of accounts) {
        if (account.stellar_address) {
          this.subscribedAddresses.set(account.stellar_address, {
            userId: account.user_id,
            tag: account.tag,
          });
          try {
            await StellarStreamCursor.getOrCreate(account.stellar_address);
          } catch (err) {
            logger.warn(`[StellarStream] Could not initialize cursor for ${account.stellar_address}:`, err.message);
          }
        }
      }

      if (redis.isOpen) {
        await redis.set(
          STREAM_ADDRESSES_KEY,
          JSON.stringify(Object.fromEntries(this.subscribedAddresses))
        );
      }

      logger.info(`[StellarStream] Loaded ${this.subscribedAddresses.size} addresses for streaming`);
      return this.subscribedAddresses.size;
    } catch (error) {
      logger.error('[StellarStream] Failed to load addresses:', error);
      throw error;
    }
  }

  registerAddress(stellarAddress, userId, tag = null) {
    this.subscribedAddresses.set(stellarAddress, { userId, tag });
    logger.info(`[StellarStream] Registered address ${stellarAddress} for user ${userId}`);
  }

  unregisterAddress(stellarAddress) {
    const removed = this.subscribedAddresses.delete(stellarAddress);
    if (removed) {
      logger.info(`[StellarStream] Unregistered address ${stellarAddress}`);
    }
    return removed;
  }

  async getCursor() {
    try {
      if (redis.isOpen) {
        const redisCursor = await redis.get(STREAM_CURSOR_KEY);
        if (redisCursor) {
          return redisCursor;
        }
      }
      try {
        const latestCursor = await StellarStreamCursor.getLatest();
        if (latestCursor?.cursor) {
          if (redis.isOpen) {
            await redis.set(STREAM_CURSOR_KEY, latestCursor.cursor);
          }
          return latestCursor.cursor;
        }
      } catch (dbError) {
        logger.warn('[StellarStream] Could not get cursor from database:', dbError.message);
      }
    } catch (error) {
      logger.warn('[StellarStream] Failed to get cursor:', error.message);
    }
    return 'now';
  }

  async saveCursor(cursor) {
    try {
      if (redis.isOpen) {
        await redis.set(STREAM_CURSOR_KEY, cursor);
      }
      try {
        const address = this.status.lastAddress || null;
        if (address) {
          await StellarStreamCursor.update(address, {
            cursor,
            last_processed_at: db.fn.now(),
          });
        }
      } catch (dbError) {
        logger.debug('[StellarStream] Could not save cursor to database:', dbError.message);
      }
      this.lastProcessedCursor = cursor;
      this.status.lastProcessedCursor = cursor;
    } catch (error) {
      logger.error('[StellarStream] Failed to save cursor:', error.message);
    }
  }

  async updateStatus() {
    try {
      if (redis.isOpen) {
        this.status.lastHeartbeat = new Date().toISOString();
        await redis.set(STREAM_STATUS_KEY, JSON.stringify(this.status));
      }
    } catch (error) {
      logger.warn('[StellarStream] Failed to update status in Redis:', error.message);
    }
  }

  async getStatus() {
    try {
      if (redis.isOpen) {
        const status = await redis.get(STREAM_STATUS_KEY);
        if (status) {
          return JSON.parse(status);
        }
      }
    } catch (error) {
      logger.warn('[StellarStream] Failed to get status from Redis:', error.message);
    }
    return this.status;
  }

  async start() {
    if (this.running) {
      logger.warn('[StellarStream] Already running');
      return;
    }

    this.running = true;
    this.status.running = true;
    this.status.startedAt = new Date().toISOString();

    await this.loadAddresses();
    await this.connect();

    this.heartbeatInterval = setInterval(() => {
      this.updateStatus();
    }, 30000);

    logger.info('[StellarStream] Stream service started');
  }

  async connect() {
    const cursor = await this.getCursor();
    logger.info(`[StellarStream] Connecting with cursor: ${cursor}`);

    try {
      const paymentsCallBuilder = this.server.payments();

      if (cursor !== 'now') {
        paymentsCallBuilder.cursor(cursor);
      }

      this.stopFn = paymentsCallBuilder.stream({
        onmessage: (payment) => this._handlePayment(payment),
        onerror: (error) => this._handleError(error),
      });

      this.status.connected = true;
      this.reconnectDelay = RECONNECT_CONFIG.baseDelayMs;
      this.reconnectAttempts = 0;
      
      logger.info('[StellarStream] Connected to Horizon streaming endpoint');
      await this.updateStatus();

    } catch (error) {
      logger.error('[StellarStream] Failed to connect:', error);
      this.status.connected = false;
      this.status.lastError = error.message;
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (!this.running) {
      return;
    }

    if (this.stopFn) {
      this.stopFn();
      this.stopFn = null;
    }

    this.status.connected = false;
    this.reconnectAttempts++;

    if (this.reconnectAttempts > RECONNECT_CONFIG.maxAttempts) {
      logger.error('[StellarStream] Max reconnection attempts reached');
      this.status.lastError = 'Max reconnection attempts reached';
      this.status.running = false;
      this.running = false;
      return;
    }

    logger.info(`[StellarStream] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      if (this.running) {
        this.connect();
      }
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      RECONNECT_CONFIG.maxDelayMs
    );
  }

  _handleError(error) {
    logger.error('[StellarStream] Stream error:', error);
    this.status.errorCount++;
    this.status.lastError = error.message || 'Unknown error';
    this.status.connected = false;
    this._scheduleReconnect();
  }

  async _handlePayment(payment) {
    try {
      if (payment.type !== 'payment' && payment.type_i !== 0) {
        return;
      }

      const destinationAddress = payment.to || payment.destination;
      const accountInfo = this.subscribedAddresses.get(destinationAddress);
      
      if (!accountInfo) {
        return;
      }

      const { userId, tag } = accountInfo;
      const amount = payment.amount;
      const assetType = payment.asset_type || 'native';
      const assetCode = assetType === 'native' ? 'XLM' : payment.asset_code || 'UNKNOWN';
      const sourceAddress = payment.from || payment.source_account;
      const pagingToken = payment.paging_token;
      const transactionHash = payment.transaction_hash;
      const memo = payment.transaction?.memo || null;

      this.status.lastAddress = destinationAddress;

      logger.info(`[StellarStream] Processing payment: ${amount} ${assetCode} to ${destinationAddress} (${tag})`);

      try {
        const alreadyProcessed = await StellarStreamCursor.isProcessed(destinationAddress, transactionHash);
        if (alreadyProcessed) {
          logger.info(`[StellarStream] Duplicate payment detected via cursor: ${transactionHash}`);
          await this.saveCursor(pagingToken);
          return;
        }
      } catch (err) {
        logger.debug('[StellarStream] Cursor check skipped:', err.message);
      }

      const existingTx = await db('transactions')
        .where({ tx_hash: transactionHash, type: 'credit' })
        .first();

      if (existingTx) {
        logger.info(`[StellarStream] Duplicate payment detected in transactions: ${transactionHash}`);
        await this.saveCursor(pagingToken);
        await this.saveCursorForAddress(destinationAddress, pagingToken, transactionHash);
        return;
      }

      const balance = await db('balances')
        .select('balances.*', 'tokens.price as token_price')
        .leftJoin('tokens', 'balances.token_id', 'tokens.id')
        .where('balances.user_id', userId)
        .whereRaw(`
          (tokens.symbol = ? OR (tokens.symbol IS NULL AND ? = 'XLM'))
        `, [assetCode, assetCode])
        .first();

      const trx = await db.transaction();

      try {
        let balanceRecord;
        if (balance) {
          balanceRecord = await Balance.credit(balance.id, parseFloat(amount), trx);
        } else {
          let token = await db('tokens').where({ symbol: assetCode }).first();
          
          if (!token && assetCode !== 'XLM') {
            const [tokenId] = await trx('tokens').insert({
              name: assetCode,
              symbol: assetCode,
              chain: 'XLM',
              price: 0,
              decimals: 7,
              is_active: true,
              created_at: db.fn.now(),
              updated_at: db.fn.now(),
            }).returning('id');
            token = await db('tokens').where({ id: tokenId }).first();
          }

          const chainXLM = await db('chains').where({ symbol: 'XLM' }).first();
          
          const [newBalanceId] = await trx('balances').insert({
            user_id: userId,
            token_id: token?.id || null,
            chain_id: chainXLM?.id,
            amount: parseFloat(amount),
            address: destinationAddress,
            usd_value: parseFloat(amount) * (token?.price || 0),
            created_at: db.fn.now(),
            updated_at: db.fn.now(),
          }).returning('id');
          
          balanceRecord = await db('balances').where({ id: newBalanceId }).first();
        }

        const transaction = await Transaction.create({
          user_id: userId,
          type: 'credit',
          status: 'completed',
          amount: parseFloat(amount),
          usd_value: parseFloat(amount) * (balanceRecord?.token_price || 0),
          token_id: balanceRecord?.token_id,
          chain_id: balanceRecord?.chain_id,
          tx_hash: transactionHash,
          sender: sourceAddress,
          recipient: destinationAddress,
          memo: memo,
          metadata: {
            stellar_paging_token: pagingToken,
            asset_type: assetType,
            source_address: sourceAddress,
            destination_address: destinationAddress,
          },
        }, trx);

        await trx.commit();

        logger.info(`[StellarStream] Credit processed: ${amount} ${assetCode} to user ${userId} (tx: ${transactionHash})`);

        await WebhookService.dispatch(
          WEBHOOK_EVENTS.PAYMENT_COMPLETED,
          {
            transaction_id: transaction?.id,
            user_id: userId,
            amount: parseFloat(amount),
            asset_code: assetCode,
            tx_hash: transactionHash,
            tag: tag,
            sender: sourceAddress,
            recipient: destinationAddress,
            memo: memo,
          },
          userId
        );

        await WebhookService.dispatch(
          WEBHOOK_EVENTS.WALLET_CREDITED,
          {
            user_id: userId,
            amount: parseFloat(amount),
            asset_code: assetCode,
            new_balance: balanceRecord?.amount,
            tx_hash: transactionHash,
          },
          userId
        );

      } catch (innerError) {
        await trx.rollback();
        throw innerError;
      }

      await this.saveCursor(pagingToken);
      await this.saveCursorForAddress(destinationAddress, pagingToken, transactionHash);

    } catch (error) {
      logger.error('[StellarStream] Error processing payment:', error);
      this.status.errorCount++;
      this.status.lastError = error.message;
    }
  }

  async saveCursorForAddress(stellarAddress, cursor, txHash) {
    try {
      await StellarStreamCursor.markProcessed(stellarAddress, cursor, txHash);
    } catch (error) {
      logger.debug('[StellarStream] Could not save cursor for address:', error.message);
    }
  }

  stop() {
    logger.info('[StellarStream] Stopping stream service...');
    
    this.running = false;
    this.status.running = false;
    this.status.connected = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.stopFn) {
      this.stopFn();
      this.stopFn = null;
    }

    this.updateStatus();
    logger.info('[StellarStream] Stream service stopped');
  }

  async reloadAddresses() {
    logger.info('[StellarStream] Reloading addresses...');
    await this.loadAddresses();
  }
}

let streamService = null;

export const getStreamService = () => {
  if (!streamService) {
    streamService = new StellarStreamService();
  }
  return streamService;
};

export const createStreamService = () => {
  streamService = new StellarStreamService();
  return streamService;
};

export default StellarStreamService;