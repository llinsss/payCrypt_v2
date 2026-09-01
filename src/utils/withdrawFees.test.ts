import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateMaxWithdrawable,
  estimateWithdrawFees,
} from "./withdrawFees.ts";

const cryptoFees = { baseFee: 0.05, platformFeeRate: 0.001, fiatFee: 0 };
const fiatFees = { baseFee: 0.05, platformFeeRate: 0.001, fiatFee: 5 };

test("max withdrawable leaves enough balance to cover its own fees", () => {
  const balance = 1000;
  const max = calculateMaxWithdrawable(balance, cryptoFees);
  const fees = estimateWithdrawFees(max, cryptoFees);
  assert.ok(max + fees.total <= balance);
  assert.ok(max > balance * 0.99, "max should stay close to balance for small fees");
});

test("dust balance that can't cover flat fees returns 0", () => {
  assert.equal(calculateMaxWithdrawable(0.01, fiatFees), 0);
  assert.equal(calculateMaxWithdrawable(0, cryptoFees), 0);
});

test("max shrinks when fees increase (fee-change case)", () => {
  const balance = 1000;
  const lowFeeMax = calculateMaxWithdrawable(balance, cryptoFees);
  const highFeeMax = calculateMaxWithdrawable(balance, {
    baseFee: 2,
    platformFeeRate: 0.02,
    fiatFee: 0,
  });
  assert.ok(highFeeMax < lowFeeMax);
});

test("fiat withdrawals reserve the flat fiat fee", () => {
  const balance = 10;
  const max = calculateMaxWithdrawable(balance, fiatFees);
  const fees = estimateWithdrawFees(max, fiatFees);
  assert.ok(max + fees.total <= balance);
});
