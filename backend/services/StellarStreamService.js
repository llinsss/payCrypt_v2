import { Horizon } from "@stellar/stellar-sdk";
import redis from "../config/redis.js";
import logger from "../utils/logger.js";
import StellarAccount from "../models/StellarAccount.js";
import StellarTransaction from "../models/StellarTransaction.js";
import Transaction from "../models/Transaction.js";
import WebhookService, { WEBHOOK_EVENTS } from "./WebhookService.js";

const HORIZON_URL =
  process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";

// Redis keys
const CURSOR_KEY = (address) => `stellar:stream:cursor:${address}`;
const PROCESSED_KEY = (id) => `stellar:stream:processed:${id}`;

// Idempotency marker TTL (7 days) — Horizon can replay on reconnect.
const PROCESSED_TTL = 7 * 24 * 60 * 60;

// Exponential backoff configuration
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 60000;

/**
 * Real-time Stellar Horizon payment streaming.
 *
 * One SSE stream per registered stellar account. Cursors are persisted in
 * Redis so a restart resumes exactly where it left off instead of replaying
 * or skipping history.
 */
class StellarStreamService {
  constructor() {
    this.server = new Horizon.Server(HORIZON_URL);
    // address -> { closeFn, attempts, connectedAt, lastEventAt, lastError, reconnects }
    this.streams = new Map();
    this.timers = new Map();
    this.started = false;
  }

  /* ---------------------------------------------------------------- cursors */

  async getCursor(address) {
    try {
      return (await redis.get(CURSOR_KEY(address))) || "now";
    } catch (error) {
      logger.warn(
        `Stellar stream: cursor read failed for ${address}, starting at 'now'`,
        { error: error.message }
      );
      return "now";
    }
  }

  async setCursor(address, cursor) {
    if (!cursor) return;
    try {
      await redis.set(CURSOR_KEY(address), String(cursor));
    } catch (error) {
      logger.warn(`Stellar stream: cursor write failed for ${address}`, {
        error: error.message,
      });
    }
  }

  /**
   * Redis-backed idempotency guard. Returns true only the first time a given
   * payment id is seen, so replays after a reconnect are dropped.
   */
  async markProcessed(paymentId) {
    try {
      const res = await redis.set(PROCESSED_KEY(paymentId), "1", {
        NX: true,
        EX: PROCESSED_TTL,
      });
      return res === "OK";
    } catch (error) {
      // Fail open: the DB unique constraint on transaction_hash is the
      // second line of defence.
      logger.warn("Stellar stream: idempotency check unavailable", {
        error: error.message,
      });
      return true;
    }
  }

  /* --------------------------------------------------------------- lifecycle */

  async start() {
    if (this.started) return;
    this.started = true;

    const accounts = await StellarAccount.getActive(1000, 0);
    if (!accounts.length) {
      logger.info("Stellar stream: no active accounts to monitor");
      return;
    }

    for (const account of accounts) {
      this.subscribe(account.stellar_address);
    }

    logger.info(`Stellar stream: monitoring ${accounts.length} account(s)`, {
      horizon: HORIZON_URL,
    });
  }

  async subscribe(address) {
    if (this.streams.has(address)) return;
    this.streams.set(address, {
      closeFn: null,
      attempts: 0,
      connectedAt: null,
      lastEventAt: null,
      lastError: null,
      reconnects: 0,
    });
    await this.openStream(address);
  }

  async openStream(address) {
    const state = this.streams.get(address);
    if (!state) return;

    const cursor = await this.getCursor(address);

    try {
      const closeFn = this.server
        .payments()
        .forAccount(address)
        .cursor(cursor)
        .stream({
          onmessage: (payment) => {
            // Reset backoff on first successful message.
            state.attempts = 0;
            state.lastEventAt = new Date().toISOString();
            this.handlePayment(address, payment).catch((error) => {
              logger.error(`Stellar stream: handler failed for ${address}`, {
                error: error.message,
                payment_id: payment?.id,
              });
            });
          },
          onerror: (error) => {
            state.lastError = error?.message || "stream error";
            logger.error(`Stellar stream: error on ${address}`, {
              error: state.lastError,
            });
            this.scheduleReconnect(address);
          },
        });

      state.closeFn = closeFn;
      state.connectedAt = new Date().toISOString();
      logger.info(`Stellar stream: connected for ${address}`, { cursor });
    } catch (error) {
      state.lastError = error.message;
      logger.error(`Stellar stream: failed to open for ${address}`, {
        error: error.message,
      });
      this.scheduleReconnect(address);
    }
  }

  /**
   * Exponential backoff with jitter, capped at BACKOFF_MAX_MS, so Horizon
   * downtime doesn't turn into a reconnect storm.
   */
  scheduleReconnect(address) {
    const state = this.streams.get(address);
    if (!state || !this.started) return;

    // Tear down the broken stream before opening a new one.
    this.closeStream(address, { keepState: true });

    if (this.timers.has(address)) return;

    const attempt = state.attempts++;
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
    const jitter = Math.floor(Math.random() * 250);
    const wait = delay + jitter;

    logger.warn(
      `Stellar stream: reconnecting ${address} in ${wait}ms (attempt ${attempt + 1})`
    );

    const timer = setTimeout(async () => {
      this.timers.delete(address);
      state.reconnects++;
      await this.openStream(address);
    }, wait);

    if (typeof timer.unref === "function") timer.unref();
    this.timers.set(address, timer);
  }

  closeStream(address, { keepState = false } = {}) {
    const state = this.streams.get(address);
    if (state?.closeFn) {
      try {
        state.closeFn();
      } catch {
        /* already closed */
      }
      state.closeFn = null;
    }
    const timer = this.timers.get(address);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(address);
    }
    if (!keepState) this.streams.delete(address);
  }

  stop() {
    this.started = false;
    for (const address of [...this.streams.keys()]) {
      this.closeStream(address);
    }
    logger.info("Stellar stream: stopped all streams");
  }

  /* ----------------------------------------------------------- event handling */

  /**
   * Persist an incoming payment, credit the account and fire webhooks.
   * Outgoing payments only advance the cursor.
   */
  async handlePayment(address, payment) {
    // Advance the cursor first so a crash mid-processing doesn't replay
    // forever; idempotency below protects against double-credit.
    await this.setCursor(address, payment.paging_token);

    if (payment.type !== "payment" && payment.type !== "create_account") {
      return;
    }

    const isIncoming =
      payment.type === "create_account"
        ? payment.account === address
        : payment.to === address;

    if (!isIncoming) return;

    const isNew = await this.markProcessed(payment.id);
    if (!isNew) {
      logger.debug(`Stellar stream: skipping duplicate payment ${payment.id}`);
      return;
    }

    const amount =
      payment.type === "create_account"
        ? payment.starting_balance
        : payment.amount;
    const assetCode =
      payment.asset_type === "native" ? "XLM" : payment.asset_code || "XLM";
    const from =
      payment.type === "create_account" ? payment.funder : payment.from;

    const account = await StellarAccount.findByAddress(address);
    if (!account) {
      logger.warn(`Stellar stream: no account record for ${address}`);
      return;
    }

    // 1. Stellar-level transaction record (unique on transaction_hash).
    try {
      const existing = await StellarTransaction.findByHash(
        payment.transaction_hash
      );
      if (!existing) {
        await StellarTransaction.create({
          transaction_hash: payment.transaction_hash,
          stellar_address: address,
          source_account: from,
          destination_account: address,
          transaction_type: payment.type,
          asset_code: assetCode,
          asset_issuer: payment.asset_issuer || null,
          amount,
          fee: 0,
          status: "success",
          is_incoming: true,
          ledger_close_time: payment.created_at,
          operation_details: JSON.stringify(payment),
        });
      }
    } catch (error) {
      logger.error("Stellar stream: failed to record stellar transaction", {
        error: error.message,
        hash: payment.transaction_hash,
      });
      return;
    }

    // 2. Credit the account balance snapshot.
    try {
      const current = Number(account.xlm_balance) || 0;
      if (assetCode === "XLM") {
        await StellarAccount.updateBalance(
          address,
          current + Number(amount),
          account.balances || []
        );
      }
    } catch (error) {
      logger.error("Stellar stream: balance update failed", {
        error: error.message,
        address,
      });
    }

    // 3. User-facing transaction history entry.
    let userTx = null;
    if (account.user_id) {
      try {
        userTx = await Transaction.create({
          user_id: account.user_id,
          type: "deposit",
          status: "completed",
          amount,
          tx_hash: payment.transaction_hash,
          metadata: {
            source: "stellar_horizon_stream",
            asset_code: assetCode,
            from,
          },
        });
      } catch (error) {
        logger.error("Stellar stream: failed to create user transaction", {
          error: error.message,
          user_id: account.user_id,
        });
      }
    }

    // 4. Webhook delivery.
    try {
      await WebhookService.dispatch(
        WEBHOOK_EVENTS.WALLET_CREDITED,
        {
          transaction_id: userTx?.id || null,
          user_id: account.user_id || null,
          stellar_address: address,
          transaction_hash: payment.transaction_hash,
          amount,
          asset_code: assetCode,
          from,
          created_at: payment.created_at,
        },
        account.user_id || null
      );
    } catch (error) {
      logger.error("Stellar stream: webhook dispatch failed", {
        error: error.message,
      });
    }

    logger.info(
      `Stellar stream: credited ${amount} ${assetCode} to ${address}`,
      { hash: payment.transaction_hash }
    );
  }

  /* -------------------------------------------------------------- health */

  getStatus() {
    const streams = [...this.streams.entries()].map(([address, s]) => ({
      address,
      connected: Boolean(s.closeFn),
      connectedAt: s.connectedAt,
      lastEventAt: s.lastEventAt,
      reconnects: s.reconnects,
      lastError: s.lastError,
    }));

    const active = streams.filter((s) => s.connected).length;

    return {
      running: this.started,
      horizon: HORIZON_URL,
      total: streams.length,
      active,
      degraded: this.started && streams.length > 0 && active < streams.length,
      streams,
    };
  }
}

export default new StellarStreamService();
