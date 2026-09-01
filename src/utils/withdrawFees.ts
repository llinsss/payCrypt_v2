export interface WithdrawFeeParams {
  /** Flat fee charged regardless of amount (e.g. network fee), in the withdrawal currency. */
  baseFee: number;
  /** Fee charged as a fraction of the amount (e.g. 0.001 for 0.1%). */
  platformFeeRate: number;
  /** Additional flat fee for fiat/bank withdrawals. */
  fiatFee: number;
}

export interface WithdrawFeeBreakdown {
  baseFee: number;
  platformFee: number;
  fiatFee: number;
  total: number;
}

const DECIMALS = 8;
const EPSILON = 1 / 10 ** DECIMALS;

function roundDown(value: number): number {
  const factor = 10 ** DECIMALS;
  return Math.floor(value * factor) / factor;
}

/**
 * The maximum amount a user can withdraw is not their full balance: fees are
 * paid out of the same balance, so amount + fees(amount) must stay <= balance.
 * Solved algebraically, then nudged down by one unit and re-checked, so
 * floating-point rounding never lets amount + fees(amount) exceed balance.
 */
export function calculateMaxWithdrawable(
  balance: number,
  feeParams: WithdrawFeeParams
): number {
  if (!Number.isFinite(balance) || balance <= 0) {
    return 0;
  }

  const flatFees = feeParams.baseFee + feeParams.fiatFee;
  const numerator = balance - flatFees;
  if (numerator <= 0) {
    return 0;
  }

  let max = roundDown(numerator / (1 + feeParams.platformFeeRate));
  while (max > 0 && max + estimateWithdrawFees(max, feeParams).total > balance + EPSILON) {
    max = roundDown(max - EPSILON);
  }

  return Math.max(0, max);
}

export function estimateWithdrawFees(
  amount: number,
  feeParams: WithdrawFeeParams
): WithdrawFeeBreakdown {
  const amt = Math.max(0, amount || 0);
  const platformFee = roundDown(amt * feeParams.platformFeeRate);
  const total = roundDown(feeParams.baseFee + platformFee + feeParams.fiatFee);

  return {
    baseFee: feeParams.baseFee,
    platformFee,
    fiatFee: feeParams.fiatFee,
    total,
  };
}
