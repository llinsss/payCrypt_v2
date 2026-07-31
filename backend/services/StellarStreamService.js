import crypto from "crypto";
import { Horizon } from "stellar-sdk";
import db from "../config/database.js";
import redis from "../config/redis.js";
import WebhookService, { WEBHOOK_EVENTS } from "./WebhookService.js";
import SocketService from "./SocketService.js";
import logger from "../utils/logger.js";

const DEFAULT_HORIZON_URL = "https://horizon-testnet.stellar.org";
const CURSOR_PREFIX = "stellar:stream:cursor:";
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const ACCOUNT_REFRESH_MS = 60_000;

const assetKey = (payment) =>
  payment.asset_type === "native"
    ? "XLM"
    : `${payment.asset_code}:${payment.asset_issuer || ""}`;

/**
 * Maintains one Horizon payment SSE stream for each active Stellar account that
 * is attached to an active @tag. Cursors are deliberately per account: a slow
 * or disconnected account can never make another account skip an operation.
 */
export class StellarStreamService {
  constructor({
    horizonUrl = process.env.STELLAR_HORIZON_URL || DEFAULT_HORIZON_URL,
    server = null,
    database = db,
    redisClient = redis,
    webhookService = WebhookService,
    log = logger,
    refreshIntervalMs = ACCOUNT_REFRESH_MS,
    accountsProvider = null,
  } = {}) {
    this.server = server || new Horizon.Server(horizonUrl);
    this.db = database;
    this.redis = redisClient;
    this.webhookService = webhookService;
    this.log = log;
    this.refreshIntervalMs = refreshIntervalMs;
    this.accountsProvider = accountsProvider;
    this.streams = new Map();
    this.running = false;
    this.refreshTimer = null;
  }

  cursorKey(address) {
    return `${CURSOR_PREFIX}${address}`;
  }

  async getRegisteredAccounts() {
    if (this.accountsProvider) return this.accountsProvider();

    // A stream is created only for accounts behind a confirmed, active tag.
    // The status predicate also keeps databases created before the status
    // migration working while they are being upgraded.
    return this.db("stellar_accounts as account")
      .join("stellar_tags as tag", "tag.stellar_address", "account.stellar_address")
      .where("account.is_active", true)
      .where((query) => query.where("tag.status", "active").orWhereNull("tag.status"))
      .distinct("account.stellar_address", "account.user_id");
  }

  async start() {
    if (this.running) return;
    this.running = true;
    await this.refreshAccounts();
    this.refreshTimer = setInterval(() => {
      this.refreshAccounts().catch((error) =>
        this.log.error("Unable to refresh Stellar stream accounts", { error: error.message }),
      );
    }, this.refreshIntervalMs);
  }

  async refreshAccounts() {
    const accounts = await this.getRegisteredAccounts();
    const wanted = new Map(accounts.map((account) => [account.stellar_address, account]));

    for (const [address, stream] of this.streams) {
      if (!wanted.has(address)) this.stopAccount(stream);
    }
    for (const account of wanted.values()) {
      if (!this.streams.has(account.stellar_address)) {
        const stream = {
          address: account.stellar_address,
          userId: account.user_id,
          stop: null,
          reconnectTimer: null,
          reconnectDelay: RECONNECT_BASE_MS,
          connected: false,
          lastEventAt: null,
          lastError: null,
          nextRetryAt: null,
        };
        this.streams.set(stream.address, stream);
        await this.connect(stream);
      }
    }
  }

  async getCursor(address) {
    try {
      return (await this.redis.get(this.cursorKey(address))) || "now";
    } catch (error) {
      // Do not prevent the SSE service starting if Redis is temporarily down.
      // Horizon's idempotent database writes make an eventual replay safe.
      this.log.warn("Unable to load Stellar stream cursor", { address, error: error.message });
      return "now";
    }
  }

  async saveCursor(address, cursor) {
    if (!cursor) return;
    await this.redis.set(this.cursorKey(address), cursor);
  }

  async connect(stream) {
    if (!this.running || !this.streams.has(stream.address)) return;
    const cursor = await this.getCursor(stream.address);
    try {
      stream.stop = this.server
        .payments()
        .forAccount(stream.address)
        .cursor(cursor)
        .stream({
          onmessage: (payment) => this.handlePayment(stream, payment),
          onerror: (error) => this.scheduleReconnect(stream, error),
        });
      stream.connected = true;
      stream.lastError = null;
      stream.nextRetryAt = null;
      stream.reconnectDelay = RECONNECT_BASE_MS;
      this.log.info("Stellar payment stream connected", { address: stream.address, cursor });
    } catch (error) {
      this.scheduleReconnect(stream, error);
    }
  }

  scheduleReconnect(stream, error) {
    if (!this.running || !this.streams.has(stream.address) || stream.reconnectTimer) return;
    if (stream.stop) {
      stream.stop();
      stream.stop = null;
    }
    stream.connected = false;
    stream.lastError = error?.message || String(error);
    const delay = stream.reconnectDelay;
    stream.nextRetryAt = new Date(Date.now() + delay).toISOString();
    stream.reconnectTimer = setTimeout(async () => {
      stream.reconnectTimer = null;
      await this.connect(stream);
    }, delay);
    stream.reconnectDelay = Math.min(delay * 2, RECONNECT_MAX_MS);
    this.log.warn("Stellar payment stream disconnected; reconnect scheduled", {
      address: stream.address,
      delay,
      error: stream.lastError,
    });
  }

  stopAccount(stream) {
    if (stream.reconnectTimer) clearTimeout(stream.reconnectTimer);
    if (stream.stop) stream.stop();
    this.streams.delete(stream.address);
  }

  stop() {
    this.running = false;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    for (const stream of [...this.streams.values()]) this.stopAccount(stream);
  }

  async handlePayment(stream, payment) {
    // Account payment streams can include non-payment operations such as
    // create_account. Only incoming payment operations credit a tagged user.
    if (payment.type !== "payment" || payment.to !== stream.address) return;

    try {
      const transaction = await this.recordIncomingPayment(stream, payment);
      // A duplicate is a replay after a restart. It must advance the cursor,
      // but it must never cause a second balance credit or webhook delivery.
      await this.saveCursor(stream.address, payment.paging_token);
      stream.lastEventAt = new Date().toISOString();
      if (transaction) {
        // Transaction lists are cached for two minutes by the main model. A
        // stream credit must invalidate that list immediately to meet the
        // real-time history guarantee instead of waiting for cache expiry.
        await this.invalidateTransactionHistory(stream.userId);
        await this.webhookService.dispatch(
          WEBHOOK_EVENTS.WALLET_CREDITED,
          {
            transaction_id: transaction.id,
            stellar_transaction_hash: payment.transaction_hash,
            stellar_operation_id: payment.id,
            amount: payment.amount,
            asset: payment.asset_type === "native" ? "XLM" : payment.asset_code,
            from_address: payment.from,
            to_address: payment.to,
          },
          stream.userId,
        );

        // Emit WebSocket balance update to the recipient user
        SocketService.emitBalanceUpdate(stream.userId, {
          event: 'balance_updated',
          data: {
            transaction: {
              id: transaction.id,
              type: 'credit',
              amount: payment.amount,
              asset: payment.asset_type === "native" ? "XLM" : payment.asset_code,
              status: 'completed',
              txHash: payment.transaction_hash,
            },
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      // Cursor is intentionally not saved here. Horizon will replay the event
      // after reconnect, and the DB uniqueness constraint makes that safe.
      stream.lastError = error.message;
      this.log.error("Unable to process incoming Stellar payment", {
        address: stream.address,
        paymentId: payment.id,
        error: error.message,
      });
    }
  }

  async invalidateTransactionHistory(userId) {
    try {
      let cursor = 0;
      do {
        const result = await this.redis.scan(cursor, { MATCH: `txn:user:${userId}:*`, COUNT: 100 });
        cursor = result.cursor;
        if (result.keys.length) await this.redis.del(result.keys);
      } while (String(cursor) !== "0");
    } catch (error) {
      // A cache failure must not undo a confirmed on-chain credit. The normal
      // TTL remains a fallback when Redis is unavailable.
      this.log.warn("Unable to invalidate Stellar transaction history cache", {
        userId,
        error: error.message,
      });
    }
  }

  async recordIncomingPayment(stream, payment) {
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid Stellar payment amount");

    const fingerprint = crypto
      .createHash("sha256")
      .update(`stellar:payment:${payment.id || payment.paging_token}`)
      .digest("hex");

    return this.db.transaction(async (trx) => {
      // The fingerprint unique index protects balance updates if Horizon sends
      // the same SSE event again before Redis accepts the new cursor.
      const existing = await trx("transactions").where({ fingerprint }).first();
      if (existing) return null;

      const account = await trx("stellar_accounts")
        .where({ stellar_address: stream.address, is_active: true })
        .forUpdate()
        .first();
      if (!account) throw new Error("Tagged Stellar account is no longer active");

      const existingBalances = Array.isArray(account.balances)
        ? account.balances
        : JSON.parse(account.balances || "[]");
      const key = assetKey(payment);
      const index = existingBalances.findIndex((balance) =>
        (balance.asset_code === "XLM" ? "XLM" : `${balance.asset_code}:${balance.asset_issuer || ""}`) === key,
      );
      if (index >= 0) {
        existingBalances[index] = {
          ...existingBalances[index],
          balance: (Number(existingBalances[index].balance || 0) + amount).toFixed(7),
        };
      } else {
        existingBalances.push(
          payment.asset_type === "native"
            ? { asset_code: "XLM", balance: amount.toFixed(7) }
            : { asset_code: payment.asset_code, asset_issuer: payment.asset_issuer, balance: amount.toFixed(7) },
        );
      }

      await trx("stellar_accounts").where({ id: account.id }).update({
        balances: JSON.stringify(existingBalances),
        ...(payment.asset_type === "native" && { xlm_balance: Number(account.xlm_balance || 0) + amount }),
        last_synced_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

      const [id] = await trx("transactions")
        .insert({
          user_id: stream.userId,
          type: "credit",
          status: "completed",
          tx_hash: payment.transaction_hash,
          amount,
          timestamp: payment.created_at || new Date().toISOString(),
          from_address: payment.from,
          to_address: payment.to,
          description: `Incoming Stellar ${payment.asset_type === "native" ? "XLM" : payment.asset_code} payment`,
          extra: JSON.stringify({ stellar_operation_id: payment.id, asset_issuer: payment.asset_issuer || null }),
          fingerprint,
        })
        .returning("id");

      // Keep the dedicated Stellar history in sync with the generic user
      // transaction history. A Horizon transaction can contain several
      // operations; the generic fingerprint above is the authoritative
      // idempotency key for this individual payment operation.
      // Existing installations use transaction_hash as a unique field, so a
      // second operation from the same Stellar transaction cannot be stored in
      // this legacy table. ON CONFLICT avoids aborting the enclosing credit.
      await trx("stellar_transactions")
        .insert({
          transaction_hash: payment.transaction_hash,
          stellar_address: stream.address,
          source_account: payment.from,
          destination_account: payment.to,
          transaction_type: "payment",
          asset_code: payment.asset_type === "native" ? "XLM" : payment.asset_code,
          asset_issuer: payment.asset_issuer || null,
          amount,
          fee: 0,
          memo_type: null,
          memo: null,
          status: "success",
          ledger_number: payment.ledger_attr || null,
          ledger_close_time: payment.created_at || null,
          operation_details: JSON.stringify(payment),
          is_incoming: true,
        })
        .onConflict("transaction_hash")
        .ignore();

      return { id: typeof id === "object" ? id.id : id };
    });
  }

  getStatus() {
    const streams = [...this.streams.values()].map((stream) => ({
      address: stream.address,
      connected: stream.connected,
      lastEventAt: stream.lastEventAt,
      lastError: stream.lastError,
      nextRetryAt: stream.nextRetryAt,
    }));
    return {
      running: this.running,
      activeStreams: streams.filter((stream) => stream.connected).length,
      configuredAccounts: streams.length,
      healthy: this.running && streams.every((stream) => stream.connected),
      streams,
    };
  }
}

const stellarStreamService = new StellarStreamService();
export default stellarStreamService;
