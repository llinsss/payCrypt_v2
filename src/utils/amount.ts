import { apiClient } from "./api";
import { parseAmountResponse } from "./apiContracts";

/**
 * Safely parses a value that is expected to be a finite decimal number.
 * Returns `null` instead of `NaN` for undefined, null, empty, non-numeric,
 * or non-finite (Infinity/-Infinity) input, so callers can isolate bad rows
 * instead of letting one malformed value poison an aggregate total.
 */
export const parseDecimal = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Sums a list of decimal-like values, skipping any entries that fail to
 * parse. Returns the running total plus how many entries were invalid, so
 * the UI can show a degraded state instead of silently showing NaN.
 */
export const sumDecimals = <T>(
  items: T[],
  getValue: (item: T) => unknown
): { total: number; invalidCount: number } => {
  let total = 0;
  let invalidCount = 0;
  for (const item of items) {
    const parsed = parseDecimal(getValue(item));
    if (parsed === null) {
      invalidCount += 1;
    } else {
      total += parsed;
    }
  }
  return { total, invalidCount };
};

export const formatCurrency = (amount: number, currency = "USD") => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatCrypto = (amount: number, symbol: string) => {
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })} ${symbol}`;
};

export const formatCurrencyToNGN = (amount: number, currency = "NGN") => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const getCryptoUSDValue = async (amount: number, token?: string) => {
  const response = await apiClient.post<unknown>("/usd-equivalent", { token, amount });
  return parseAmountResponse(response);
};
