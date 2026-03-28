import { ethers } from "ethers";
import { getEvmProvider } from "../contracts/index.js";
import Balance from "../models/Balance.js";
import Notification from "../models/Notification.js";
import db from "../config/database.js";

// ---------------------------------------------------------------------------
// ERC-20 minimal ABI — only balanceOf is needed
// ---------------------------------------------------------------------------
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// ---------------------------------------------------------------------------
// Chain configuration
// Each entry declares the native token and the ERC-20 tokens to reconcile.
// Token contract addresses are read from env so they can differ per network.
// ---------------------------------------------------------------------------
const EVM_CHAIN_CONFIG = {
  base: {
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    tokens: [
      {
        symbol: "USDC",
        envAddress: "BASE_USDC_ADDRESS",
        decimals: 6,
      },
      {
        symbol: "USDT",
        envAddress: "BASE_USDT_ADDRESS",
        decimals: 6,
      },
    ],
  },
  lisk: {
    nativeSymbol: "LSK",
    nativeDecimals: 8,
    tokens: [
      {
        symbol: "USDC",
        envAddress: "LISK_USDC_ADDRESS",
        decimals: 6,
      },
      {
        symbol: "USDT",
        envAddress: "LISK_USDT_ADDRESS",
        decimals: 6,
      },
    ],
  },
  flow: {
    nativeSymbol: "FLOW",
    nativeDecimals: 8,
    tokens: [
      {
        symbol: "USDC",
        envAddress: "FLOW_USDC_ADDRESS",
        decimals: 6,
      },
      {
        symbol: "USDT",
        envAddress: "FLOW_USDT_ADDRESS",
        decimals: 6,
      },
    ],
  },
  u2u: {
    nativeSymbol: "U2U",
    nativeDecimals: 18,
    tokens: [
      {
        symbol: "USDC",
        envAddress: "U2U_USDC_ADDRESS",
        decimals: 6,
      },
      {
        symbol: "USDT",
        envAddress: "U2U_USDT_ADDRESS",
        decimals: 6,
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Discrepancy thresholds (USD equivalent)
// Values are configurable via environment variables.
// ---------------------------------------------------------------------------
const AUTO_CORRECT_THRESHOLD_USD = parseFloat(
  process.env.EVM_RECONCILE_AUTO_CORRECT_USD ?? "1.0",
);
const MAJOR_DISCREPANCY_THRESHOLD_USD = parseFloat(
  process.env.EVM_RECONCILE_MAJOR_THRESHOLD_USD ?? "10.0",
);

// ---------------------------------------------------------------------------
// EvmReconciliationService
// ---------------------------------------------------------------------------

const EvmReconciliationService = {
  // ── On-chain fetch: native token ──────────────────────────────────────────

  async fetchNativeBalance(provider, address) {
    try {
      const raw = await provider.getBalance(address);
      return raw; // BigInt
    } catch (err) {
      throw new Error(
        `Failed to fetch native balance for ${address}: ${err.message}`,
      );
    }
  },

  // ── On-chain fetch: ERC-20 token ─────────────────────────────────────────

  async fetchErc20Balance(provider, tokenAddress, walletAddress) {
    try {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const raw = await contract.balanceOf(walletAddress);
      return raw; // BigInt
    } catch (err) {
      throw new Error(
        `Failed to fetch ERC-20 balance (token: ${tokenAddress}, wallet: ${walletAddress}): ${err.message}`,
      );
    }
  },

  // ── Format raw BigInt balance to a decimal number ─────────────────────────

  formatBalance(rawBigInt, decimals) {
    return parseFloat(ethers.formatUnits(rawBigInt, decimals));
  },

  // ── Classify discrepancy and return action ────────────────────────────────

  classifyDiscrepancy(absDiffUsd) {
    if (absDiffUsd === 0) return "ok";
    if (absDiffUsd < AUTO_CORRECT_THRESHOLD_USD) return "auto_correct";
    if (absDiffUsd < MAJOR_DISCREPANCY_THRESHOLD_USD) return "flag";
    return "major";
  },

  // ── Reconcile a single token balance for one account ─────────────────────

  async reconcileTokenBalance({
    chain,
    user_id,
    walletAddress,
    tokenSymbol,
    chainBalance,
    tokenPrice,
  }) {
    const token = await db("tokens").where({ symbol: tokenSymbol }).first();

    if (!token) {
      return { status: "skipped", reason: `token_not_found:${tokenSymbol}` };
    }

    const dbBalance =
      (await Balance.findByUserIdAndTokenId(user_id, token.id)) ??
      (await db("balances").where({ user_id, token_id: token.id }).first());

    if (!dbBalance) {
      return { status: "skipped", reason: `no_db_balance:${tokenSymbol}` };
    }

    const dbAmount = parseFloat(dbBalance.amount ?? 0);
    const diff = chainBalance - dbAmount;
    const absDiff = Math.abs(diff);
    const absDiffUsd = absDiff * (tokenPrice ?? token.price ?? 0);

    const action = this.classifyDiscrepancy(absDiffUsd);

    const result = {
      chain,
      user_id,
      wallet: walletAddress,
      symbol: tokenSymbol,
      db_balance: dbAmount,
      chain_balance: chainBalance,
      discrepancy: diff,
      abs_diff: absDiff,
      abs_diff_usd: absDiffUsd,
      status: "ok",
      action: null,
    };

    if (action === "ok") return result;

    if (action === "auto_correct") {
      await Balance.update(dbBalance.id, {
        amount: chainBalance,
        usd_value: chainBalance * (tokenPrice ?? token.price ?? 0),
      });
      result.status = "corrected";
      result.action = "auto_corrected";
      return result;
    }

    if (action === "flag") {
      await Balance.update(dbBalance.id, {
        amount: chainBalance,
        usd_value: chainBalance * (tokenPrice ?? token.price ?? 0),
      });
      result.status = "corrected_flagged";
      result.action = "corrected_and_flagged";
      return result;
    }

    // major
    result.status = "major_discrepancy";
    result.action = "alert_sent";
    await this.sendMajorDiscrepancyAlert(result);
    return result;
  },

  // ── Reconcile all tokens for a single EVM account ────────────────────────

  async reconcileAccount(chain, dbAccount, chainConfig, provider) {
    const { user_id, address: walletAddress } = dbAccount;

    const tokenResults = [];

    // 1. Native token
    let nativeOnChain = 0;
    try {
      const raw = await this.fetchNativeBalance(provider, walletAddress);
      nativeOnChain = this.formatBalance(raw, chainConfig.nativeDecimals);
    } catch (err) {
      tokenResults.push({
        symbol: chainConfig.nativeSymbol,
        status: "error",
        error: err.message,
      });
    }

    if (nativeOnChain !== null) {
      const nativeToken = await db("tokens")
        .where({ symbol: chainConfig.nativeSymbol })
        .first();
      const nativeResult = await this.reconcileTokenBalance({
        chain,
        user_id,
        walletAddress,
        tokenSymbol: chainConfig.nativeSymbol,
        chainBalance: nativeOnChain,
        tokenPrice: nativeToken?.price ?? 0,
      });
      tokenResults.push(nativeResult);
    }

    // 2. ERC-20 tokens — run in parallel, failures don't block each other
    const erc20Results = await Promise.allSettled(
      chainConfig.tokens.map(async (tokenConfig) => {
        const tokenAddress = process.env[tokenConfig.envAddress];
        if (!tokenAddress) {
          return {
            symbol: tokenConfig.symbol,
            status: "skipped",
            reason: `missing_env:${tokenConfig.envAddress}`,
          };
        }

        const raw = await this.fetchErc20Balance(
          provider,
          tokenAddress,
          walletAddress,
        );
        const chainBalance = this.formatBalance(raw, tokenConfig.decimals);

        const token = await db("tokens")
          .where({ symbol: tokenConfig.symbol })
          .first();

        return this.reconcileTokenBalance({
          chain,
          user_id,
          walletAddress,
          tokenSymbol: tokenConfig.symbol,
          chainBalance,
          tokenPrice: token?.price ?? 0,
        });
      }),
    );

    for (const settled of erc20Results) {
      if (settled.status === "fulfilled") {
        tokenResults.push(settled.value);
      } else {
        tokenResults.push({ status: "error", error: settled.reason?.message });
      }
    }

    return {
      wallet: walletAddress,
      user_id,
      chain,
      token_results: tokenResults,
    };
  },

  // ── Full reconciliation run for one chain ─────────────────────────────────

  async reconcileChain(chain) {
    const chainConfig = EVM_CHAIN_CONFIG[chain];
    if (!chainConfig) throw new Error(`Unknown EVM chain: ${chain}`);

    console.log(
      `🔍 EVM Reconciliation: starting chain ${chain.toUpperCase()}...`,
    );

    let provider;
    try {
      provider = getEvmProvider(chain);
    } catch (err) {
      console.error(
        `❌ Could not create provider for ${chain}: ${err.message}`,
      );
      return this._emptyChainReport(
        chain,
        chainConfig.nativeSymbol,
        err.message,
      );
    }

    const startedAt = new Date();
    const report = this._emptyChainReport(chain, chainConfig.nativeSymbol);
    report.started_at = startedAt.toISOString();

    // Page through EVM balances that belong to this chain
    let offset = 0;
    const batchSize = 50;

    while (true) {
      const accounts = await db("balances")
        .join("tokens", "balances.token_id", "tokens.id")
        .join("users", "balances.user_id", "users.id")
        .where("tokens.chain", chain)
        .whereNotNull("balances.address")
        .select("balances.user_id", "balances.address", "users.tag")
        .distinct("balances.address")
        .limit(batchSize)
        .offset(offset);

      if (!accounts.length) break;

      const batchResults = await Promise.allSettled(
        accounts.map((account) =>
          this.reconcileAccount(chain, account, chainConfig, provider),
        ),
      );

      for (const settled of batchResults) {
        report.total++;
        if (settled.status === "rejected") {
          report.errors++;
          report.error_details.push({ error: settled.reason?.message });
          continue;
        }

        const accountResult = settled.value;
        report.details.push(accountResult);

        for (const tr of accountResult.token_results) {
          switch (tr.status) {
            case "ok":
              report.ok++;
              break;
            case "corrected":
              report.corrected++;
              break;
            case "corrected_flagged":
              report.corrected_flagged++;
              break;
            case "major_discrepancy":
              report.major_discrepancies++;
              break;
            case "skipped":
              report.skipped++;
              break;
            case "error":
              report.errors++;
              report.error_details.push(tr);
              break;
          }
        }
      }

      offset += batchSize;
      if (accounts.length < batchSize) break;
    }

    report.finished_at = new Date().toISOString();
    report.duration_ms = Date.now() - startedAt.getTime();

    await this.saveChainReport(report);

    console.log(
      `✅ EVM Reconciliation [${chain.toUpperCase()}] — ` +
        `total: ${report.total}, ok: ${report.ok}, ` +
        `corrected: ${report.corrected + report.corrected_flagged}, ` +
        `major: ${report.major_discrepancies}, errors: ${report.errors}`,
    );

    return report;
  },

  // ── Full reconciliation across all EVM chains in parallel ─────────────────

  async runFullReconciliation() {
    console.log("🔍 EVM Reconciliation: starting all chains...");

    const chains = Object.keys(EVM_CHAIN_CONFIG);

    // Use Promise.allSettled so one failing chain never blocks the others
    const settled = await Promise.allSettled(
      chains.map((chain) => this.reconcileChain(chain)),
    );

    const summary = {
      started_at: new Date().toISOString(),
      chains: {},
    };

    for (let i = 0; i < chains.length; i++) {
      const chain = chains[i];
      const result = settled[i];

      if (result.status === "fulfilled") {
        summary.chains[chain] = {
          total: result.value.total,
          ok: result.value.ok,
          corrected: result.value.corrected + result.value.corrected_flagged,
          major_discrepancies: result.value.major_discrepancies,
          errors: result.value.errors,
          duration_ms: result.value.duration_ms,
        };
      } else {
        summary.chains[chain] = { error: result.reason?.message };
        console.error(
          `❌ Chain ${chain} reconciliation failed:`,
          result.reason?.message,
        );
      }
    }

    console.log(
      "✅ EVM Reconciliation complete:",
      JSON.stringify(summary.chains),
    );
    return summary;
  },

  // ── Report persistence ─────────────────────────────────────────────────────

  async saveChainReport(report) {
    try {
      const tokenBreakdown = {};
      for (const detail of report.details) {
        for (const tr of detail.token_results ?? []) {
          if (!tokenBreakdown[tr.symbol]) {
            tokenBreakdown[tr.symbol] = {
              ok: 0,
              corrected: 0,
              major: 0,
              errors: 0,
            };
          }
          if (tr.status === "ok") tokenBreakdown[tr.symbol].ok++;
          else if (
            tr.status === "corrected" ||
            tr.status === "corrected_flagged"
          )
            tokenBreakdown[tr.symbol].corrected++;
          else if (tr.status === "major_discrepancy")
            tokenBreakdown[tr.symbol].major++;
          else if (tr.status === "error") tokenBreakdown[tr.symbol].errors++;
        }
      }

      await db("reconciliation_reports").insert({
        chain: report.chain,
        native_symbol: report.native_symbol,
        started_at: report.started_at,
        finished_at: report.finished_at,
        duration_ms: report.duration_ms,
        total_accounts: report.total,
        ok_count: report.ok,
        corrected_count: report.corrected + report.corrected_flagged,
        major_discrepancy_count: report.major_discrepancies,
        skipped_count: report.skipped,
        error_count: report.errors,
        app_balance_corrections: report.corrected + report.corrected_flagged,
        token_breakdown: JSON.stringify(tokenBreakdown),
        details: JSON.stringify(report.details),
        error_details: JSON.stringify(report.error_details),
        created_at: db.fn.now(),
      });
    } catch (err) {
      console.warn(
        `⚠️ Could not save EVM reconciliation report for ${report.chain}:`,
        err.message,
      );
    }
  },

  // ── Alerting ──────────────────────────────────────────────────────────────

  async sendMajorDiscrepancyAlert(result) {
    const {
      chain,
      wallet,
      user_id,
      symbol,
      db_balance,
      chain_balance,
      abs_diff_usd,
    } = result;

    console.error(
      `🚨 MAJOR EVM DISCREPANCY — chain: ${chain} | wallet: ${wallet} | ` +
        `token: ${symbol} | DB: ${db_balance} | Chain: ${chain_balance} | ` +
        `Diff: ~$${abs_diff_usd.toFixed(2)} USD`,
    );

    if (user_id) {
      try {
        await Notification.create({
          user_id,
          type: "system",
          title: "Balance Discrepancy Detected",
          body:
            `A significant difference was found in your ${symbol} balance on ${chain.toUpperCase()} ` +
            `(~$${abs_diff_usd.toFixed(2)} USD). Our team has been alerted and will investigate.`,
        });
      } catch (err) {
        console.error(
          "Failed to create user notification for EVM discrepancy:",
          err.message,
        );
      }
    }
  },

  // ── Helpers ───────────────────────────────────────────────────────────────

  _emptyChainReport(chain, nativeSymbol, errorMsg = null) {
    return {
      chain,
      native_symbol: nativeSymbol,
      started_at: new Date().toISOString(),
      finished_at: null,
      duration_ms: 0,
      total: 0,
      ok: 0,
      corrected: 0,
      corrected_flagged: 0,
      major_discrepancies: 0,
      skipped: 0,
      errors: errorMsg ? 1 : 0,
      details: [],
      error_details: errorMsg ? [{ error: errorMsg }] : [],
    };
  },
};

export default EvmReconciliationService;
