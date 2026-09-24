import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BillPaymentResult from "./BillPaymentResult";
import type { BillPaymentState } from "../../utils/billsApi";

const render = (payment: BillPaymentState, onClose?: () => void) =>
  renderToStaticMarkup(<BillPaymentResult payment={payment} categoryName="Airtime" onClose={onClose} />);

describe("BillPaymentResult", () => {
  it("shows a pending state without a close button while the payment is in flight", () => {
    const html = render({ status: "pending", message: "Submitting your payment..." });

    expect(html).toContain('data-status="pending"');
    expect(html).toContain("Payment Pending");
    expect(html).toContain("Submitting your payment...");
    expect(html).not.toContain("<button");
  });

  it("shows the backend reference instead of a fabricated transaction id on success", () => {
    const html = render(
      { status: "completed", message: "Bill payment of ₦500 processed successfully", transactionId: "42", reference: "BILL-123-abc" },
      () => {}
    );

    expect(html).toContain("Payment Successful!");
    expect(html).toContain("BILL-123-abc");
    expect(html).not.toMatch(/#TXN\d+/);
    expect(html).toContain("Done");
  });

  it("shows the provider error message on failure", () => {
    const html = render({ status: "failed", message: "Insufficient wallet balance" }, () => {});

    expect(html).toContain("Payment Failed");
    expect(html).toContain("Insufficient wallet balance");
    expect(html).toContain("Try Again");
  });
});
