import db from "./database.js";
import pLimit from "p-limit";
import * as freecryptoapi from "../services/free-crypto-api.js";
import * as exchangerateapi from "../services/exchange-rate-api.js";
import redis from "./redis.js";

const limit = pLimit(5);
export const NGN_KEY = "USD_NGN";
export const SIX_HOURS = 6 * 60 * 60;
export const TOKEN_PRICE_REFRESH_MS = 5 * 60 * 1000;
export const NGN_RATE_REFRESH_MS = 60 * 60 * 1000;

/**
 * Self-scheduling refresh loop: the next run is scheduled only after the
 * current one settles, so executions never overlap. Each run holds a lease of
 * `leaseMs`; a run that outlives it is abandoned and any write it attempts
 * afterwards is rejected as stale (the task must check `isCurrent()` before
 * writing). A `run()` call made while another run is in flight is skipped and
 * resolves with the in-flight run instead of starting a duplicate.
 */
export const createRefreshJob = ({ name, task, intervalMs, leaseMs = intervalMs }) => {
  const stats = { runs: 0, skipped: 0, timedOut: 0, staleRejected: 0, lastDurationMs: null };
  let generation = 0;
  let inFlight = null;
  let timer = null;
  let started = false;

  const execute = async () => {
    const lease = ++generation;
    const isCurrent = () => {
      if (lease === generation) return true;
      stats.staleRejected++;
      return false;
    };
    const startedAt = Date.now();
    let leaseTimer;
    const expired = new Promise((resolve) => {
      leaseTimer = setTimeout(() => resolve("expired"), leaseMs);
      leaseTimer.unref?.();
    });
    const work = Promise.resolve()
      .then(() => task({ isCurrent }))
      .then(() => "done", (err) => {
        console.error(`❌ ${name} refresh failed:`, err.message);
        return "failed";
      });

    const outcome = await Promise.race([work, expired]);
    clearTimeout(leaseTimer);
    if (outcome === "expired") {
      generation++;
      stats.timedOut++;
      console.warn(`⏱️ ${name} refresh exceeded ${leaseMs}ms lease; late results will be discarded`);
    }
    stats.runs++;
    stats.lastDurationMs = Date.now() - startedAt;
    console.log(`📈 ${name} refresh ${outcome} in ${stats.lastDurationMs}ms`);
  };

  const run = () => {
    if (inFlight) {
      stats.skipped++;
      console.warn(`⏭️ ${name} refresh already in progress, skipping (skipped: ${stats.skipped})`);
      return inFlight;
    }
    inFlight = execute().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  const tick = async () => {
    await run();
    if (!started) return;
    timer = setTimeout(tick, intervalMs);
    timer.unref?.();
  };

  return {
    run,
    start() {
      if (started) return;
      started = true;
      tick();
    },
    stop() {
      started = false;
      clearTimeout(timer);
      timer = null;
    },
    stats: () => ({ ...stats, running: Boolean(inFlight) }),
  };
};

export const updateTokenPrices = async ({ isCurrent = () => true } = {}) => {
  try {
    console.log("⏳ Updating token prices...");

    const tokens = await db("tokens").select("id", "token");

    const tasks = tokens.map((token) =>
      limit(async () => {
        try {
          const data = await freecryptoapi.rate(token.token);
          const price = data?.last ? Number.parseFloat(data.last) : null;

          if (price && !Number.isNaN(price)) {
            if (!isCurrent()) {
              console.warn(`⚠️ Discarding stale price for ${token.token}`);
              return;
            }
            await db("tokens").where({ id: token.id }).update({
              price: price,
              updated_at: new Date(),
            });

            console.log(`✅ Updated ${token.token}: ${price}`);
          } else {
            console.warn(`⚠️ Skipping ${token.token}, invalid price`);
          }
        } catch (err) {
          console.error(`❌ Error updating ${token.token}:`, err.message);
        }
      })
    );

    const results = await Promise.allSettled(tasks);

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failCount = results.length - successCount;

    console.log(
      `📊 Token price update done: ${successCount} success, ${failCount} failed`
    );
  } catch (err) {
    console.error("❌ Error in updateTokenPrices:", err.message);
  }
};

export const updateNgnRate = async ({ isCurrent = () => true } = {}) => {
  try {
    console.log("⏳ Fetching USD->NGN rate...");

    const data = await exchangerateapi.rate("USD");

    if (!data || !data.NGN) {
      throw new Error("No NGN rate found in response");
    }

    const ngnValue = Number.parseFloat(data.NGN);

    if (!Number.isNaN(ngnValue)) {
      if (!isCurrent()) {
        console.warn("⚠️ Discarding stale NGN rate");
        return;
      }
      await redis.setEx(NGN_KEY, SIX_HOURS, ngnValue.toString());

      console.log(`✅ Cached NGN rate: ${ngnValue}`);
    } else {
      console.warn(
        "⚠️ Invalid NGN value received, skipping Redis cache update"
      );
    }
  } catch (err) {
    console.error("❌ Error updating NGN rate:", err.message);
  }
};

export const tokenPriceRefresh = createRefreshJob({
  name: "token-prices",
  task: updateTokenPrices,
  intervalMs: TOKEN_PRICE_REFRESH_MS,
});

export const ngnRateRefresh = createRefreshJob({
  name: "ngn-rate",
  task: updateNgnRate,
  intervalMs: NGN_RATE_REFRESH_MS,
});
