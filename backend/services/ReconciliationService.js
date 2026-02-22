import { Server, Networks } from "@stellar/stellar-sdk";
import StellarAccount from "../models/StellarAccount.js";
import Balance from "../models/Balance.js";
import Notification from "../models/Notification.js";
import db from "../config/database.js";

// Thresholds that determine how to handle a discrepancy
const MINOR_THRESHOLD_XLM = parseFloat(process.env.RECONCILE_MINOR_THRESHOLD ?? "0.01");
const MAJOR_THRESHOLD_XLM = parseFloat(process.env.RECONCILE_MAJOR_THRESHOLD ?? "1.0");

const ReconciliationService = {
  server: new Server(process.env.STELLAR_HORIZON_URL ?? "https://horizon.stellar.org"),

  // ── On-chain fetch ──────────────────────────────────────────────────────────

  async fetchOnChainBalance(stellarAddress) {
    try {
      const account = await this.server.loadAccount(stellarAddress);
      const xlmEntry = account.balances.find((b) => b.asset_type === "native");
      return {
        xlm: parseFloat(xlmEntry?.balance ?? "0"),
        all: account.balances,
      };
    } catch (err) {
      if (err?.response?.status === 404) {
        return null; // account not yet funded / does not exist on-chain
      }
      throw err;
    }
  },

  // ── Core reconciliation logic for a single account ──────────────────────────

  async reconcileAccount(dbAccount) {
    const { stellar_address, xlm_balance: dbXlm, user_id } = dbAccount;

    const onChain = await this.fetchOnChainBalance(stellar_address);

    if (!onChain) {
      return {
        address: stellar_address,
        user_id,
        status: "skipped",
        reason: "account_not_found_on_chain",
      };
    }

    const diff = Math.abs(onChain.xlm - dbXlm);
    const result = {
      address: stellar_address,
      user_id,
      db_balance: dbXlm,
      chain_balance: onChain.xlm,
      discrepancy: onChain.xlm - dbXlm,
      abs_diff: diff,
      status: "ok",
      action: null,
    };

    if (diff === 0) return result;

    if (diff <= MINOR_THRESHOLD_XLM) {
      // Auto-correct minor differences
      await StellarAccount.updateBalance(stellar_address, onChain.xlm, onChain.all);
      result.status = "corrected";
      result.action = "auto_corrected";
    } else if (diff <= MAJOR_THRESHOLD_XLM) {
      // Update DB and flag for review
      await StellarAccount.updateBalance(stellar_address, onChain.xlm, onChain.all);
      result.status = "corrected_flagged";
      result.action = "corrected_and_flagged";
    } else {
      // Major discrepancy — flag without touching the record
      result.status = "major_discrepancy";
      result.action = "alert_sent";

      await this.sendMajorDiscrepancyAlert(result);
    }

    return result;
  },

  // ── App-level balance reconciliation (balances table vs stellar_accounts) ───

  async reconcileAppBalance(stellarAccount) {
    const { user_id, xlm_balance: chainXlm } = stellarAccount;
    if (!user_id) return null;

    // Find XLM balance record in the balances table
    const xlmToken = await db("tokens").where({ symbol: "XLM" }).first();
    if (!xlmToken) return null;

    const appBalance = (await Balance.findByUserIdAndTokenId)
      ? await Balance.findByUserIdAndTokenId(user_id, xlmToken.id)
      : await db("balances").where({ user_id, token_id: xlmToken.id }).first();

    if (!appBalance) return null;

    const diff = Math.abs(appBalance.amount - chainXlm);

    if (diff > MINOR_THRESHOLD_XLM) {
      await Balance.update(appBalance.id, {
        amount: chainXlm,
        usd_value: chainXlm * (xlmToken.price ?? 0),
      });

      return {
        user_id,
        balance_id: appBalance.id,
        old_amount: appBalance.amount,
        new_amount: chainXlm,
        diff,
      };
    }

    return null;
  },

  // ── Full run across all active accounts ─────────────────────────────────────

  async runFullReconciliation() {
    console.log("🔍 Reconciliation: starting full run...");

    const startedAt = new Date();
    const report = {
      started_at: startedAt.toISOString(),
      total: 0,
      ok: 0,
      corrected: 0,
      corrected_flagged: 0,
      major_discrepancies: 0,
      skipped: 0,
      errors: 0,
      app_balance_corrections: 0,
      details: [],
      error_details: [],
    };

    // Page through active Stellar accounts in batches of 50
    let offset = 0;
    const batchSize = 50;

    while (true) {
      const accounts = await StellarAccount.getActive(batchSize, offset);
      if (!accounts.length) break;

      for (const account of accounts) {
        report.total++;
        try {
          const result = await this.reconcileAccount(account);
          report.details.push(result);

          switch (result.status) {
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
          }

          // Sync app-level balance for corrected accounts
          if (result.status === "corrected" || result.status === "corrected_flagged") {
            const updatedAccount = await StellarAccount.findByAddress(
              account.stellar_address,
            );
            const appResult = await this.reconcileAppBalance(updatedAccount);
            if (appResult) report.app_balance_corrections++;
          }
        } catch (err) {
          report.errors++;
          report.error_details.push({
            address: account.stellar_address,
            error: err.message,
          });
          console.error(
            `❌ Reconciliation error for ${account.stellar_address}:`,
            err.message,
          );
        }
      }

      offset += batchSize;
      if (accounts.length < batchSize) break; // last page
    }

    report.finished_at = new Date().toISOString();
    report.duration_ms = Date.now() - startedAt.getTime();

    await this.saveReport(report);
    console.log(
      `✅ Reconciliation complete — total: ${report.total}, ok: ${report.ok}, ` +
        `corrected: ${report.corrected + report.corrected_flagged}, ` +
        `major: ${report.major_discrepancies}, errors: ${report.errors}`,
    );

    return report;
  },

  // ── Report persistence ───────────────────────────────────────────────────────

  async saveReport(report) {
    try {
      await db("reconciliation_reports").insert({
        started_at: report.started_at,
        finished_at: report.finished_at,
        duration_ms: report.duration_ms,
        total_accounts: report.total,
        ok_count: report.ok,
        corrected_count: report.corrected + report.corrected_flagged,
        major_discrepancy_count: report.major_discrepancies,
        skipped_count: report.skipped,
        error_count: report.errors,
        app_balance_corrections: report.app_balance_corrections,
        details: JSON.stringify(report.details),
        error_details: JSON.stringify(report.error_details),
        created_at: db.fn.now(),
      });
    } catch (err) {
      // Table may not exist yet — log and continue so the run still returns
      console.warn("⚠️ Could not save reconciliation report:", err.message);
    }
  },

  async getReports(limit = 10, offset = 0) {
    try {
      return await db("reconciliation_reports")
        .select(
          "id",
          "started_at",
          "finished_at",
          "duration_ms",
          "total_accounts",
          "ok_count",
          "corrected_count",
          "major_discrepancy_count",
          "error_count",
          "app_balance_corrections",
          "created_at",
        )
        .orderBy("created_at", "desc")
        .limit(limit)
        .offset(offset);
    } catch {
      return [];
    }
  },

  async getReportById(id) {
    try {
      return await db("reconciliation_reports").where({ id }).first();
    } catch {
      return null;
    }
  },

  // ── Alerting ─────────────────────────────────────────────────────────────────

  async sendMajorDiscrepancyAlert(result) {
    const { address, user_id, db_balance, chain_balance, discrepancy } = result;

    console.error(
      `🚨 MAJOR DISCREPANCY — ${address} | DB: ${db_balance} XLM | ` +
        `Chain: ${chain_balance} XLM | Diff: ${discrepancy.toFixed(7)} XLM`,
    );

    // In-app notification for the account owner
    if (user_id) {
      try {
        await Notification.create({
          user_id,
          title: "Balance Discrepancy Detected",
          body:
            `A significant difference was found between your on-chain and recorded XLM balance ` +
            `(${Math.abs(discrepancy).toFixed(7)} XLM). Our team has been alerted and will investigate.`,
        });
      } catch (err) {
        console.error("Failed to create user notification for discrepancy:", err.message);
      }
    }
  },
};

export default ReconciliationService;
