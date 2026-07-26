import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

const mockDisputeFindById = jest.fn();
const mockDisputeGetComments = jest.fn();
const mockDisputeGetAll = jest.fn();
const mockDisputeCountAll = jest.fn();
const mockDisputeUpdate = jest.fn();
const mockTransactionFindById = jest.fn();
const mockWalletGetByUserId = jest.fn();
const mockWalletCredit = jest.fn();
const mockNotificationCreate = jest.fn();
const mockAuditLogCreate = jest.fn();
const mockSendEmail = jest.fn();

jest.unstable_mockModule("../models/Dispute.js", () => ({
  default: {
    findById: mockDisputeFindById,
    getComments: mockDisputeGetComments,
    getAll: mockDisputeGetAll,
    countAll: mockDisputeCountAll,
    update: mockDisputeUpdate,
    isValidTransition: (from, to) => {
      const transitions = {
        open: ["under_review", "closed"],
        under_review: ["escalated", "resolved", "closed"],
        escalated: ["under_review", "resolved", "closed"],
        resolved: ["closed"],
        closed: [],
      };
      return (transitions[from] || []).includes(to);
    },
  },
}));

jest.unstable_mockModule("../models/Transaction.js", () => ({
  default: { findById: mockTransactionFindById },
}));

jest.unstable_mockModule("../models/Wallet.js", () => ({
  default: { getByUserId: mockWalletGetByUserId, credit: mockWalletCredit },
}));

jest.unstable_mockModule("../models/Notification.js", () => ({
  default: { create: mockNotificationCreate },
}));

jest.unstable_mockModule("../models/AuditLog.js", () => ({
  default: { create: mockAuditLogCreate },
}));

jest.unstable_mockModule("../services/external/smtp.js", () => ({
  sendEmail: mockSendEmail,
}));

jest.unstable_mockModule("../config/database.js", () => ({
  default: Object.assign(jest.fn(), { fn: { now: jest.fn(() => "NOW()") } }),
}));

jest.unstable_mockModule("../middleware/auth.js", () => ({
  authenticate: (req, res, next) => next(),
  requireAdmin: (req, res, next) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  },
}));

const {
  listDisputes,
  getDisputeDetail,
  updateDispute,
} = await import("../controllers/disputeAdminController.js");

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("disputeAdminController.listDisputes", () => {
  it("returns a paginated list of all disputes", async () => {
    mockDisputeGetAll.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockDisputeCountAll.mockResolvedValue(2);

    const req = { query: {} };
    const res = makeRes();

    await listDisputes(req, res);

    expect(mockDisputeGetAll).toHaveBeenCalledWith(20, 0, { status: null, priority: null, category: null });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: [{ id: 1 }, { id: 2 }],
    }));
  });
});

describe("disputeAdminController.getDisputeDetail", () => {
  it("returns 404 when the dispute does not exist", async () => {
    mockDisputeFindById.mockResolvedValue(null);
    const req = { params: { id: "1" } };
    const res = makeRes();

    await getDisputeDetail(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns the dispute with its comment thread", async () => {
    mockDisputeFindById.mockResolvedValue({ id: 1, status: "open" });
    mockDisputeGetComments.mockResolvedValue([{ id: 1, comment: "hi" }]);

    const req = { params: { id: "1" } };
    const res = makeRes();

    await getDisputeDetail(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 1, status: "open", comments: [{ id: 1, comment: "hi" }] },
    });
  });
});

describe("disputeAdminController.updateDispute", () => {
  it("returns 404 when the dispute does not exist", async () => {
    mockDisputeFindById.mockResolvedValue(null);
    const req = { params: { id: "1" }, body: { status: "closed" }, user: { id: 9 } };
    const res = makeRes();

    await updateDispute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockDisputeUpdate).not.toHaveBeenCalled();
  });

  it("returns 422 for an invalid status transition", async () => {
    mockDisputeFindById.mockResolvedValue({ id: 1, status: "open", user_id: 5 });
    const req = { params: { id: "1" }, body: { status: "resolved" }, user: { id: 9 } };
    const res = makeRes();

    await updateDispute(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(mockDisputeUpdate).not.toHaveBeenCalled();
  });

  it("moves a dispute to under_review with admin notes, no refund", async () => {
    mockDisputeFindById.mockResolvedValue({ id: 1, status: "open", user_id: 5 });
    mockDisputeUpdate.mockResolvedValue({ id: 1, status: "under_review" });

    const req = {
      params: { id: "1" },
      body: { status: "under_review", adminNotes: "looking into it" },
      user: { id: 9 },
    };
    const res = makeRes();

    await updateDispute(req, res);

    expect(mockDisputeUpdate).toHaveBeenCalledWith("1", expect.objectContaining({
      admin_notes: "looking into it",
      status: "under_review",
    }));
    expect(mockWalletCredit).not.toHaveBeenCalled();
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      action: "dispute_admin_update",
      resource: "dispute",
    }));
  });

  it("refunds the wallet, notifies, and emails the user when a dispute is upheld", async () => {
    mockDisputeFindById.mockResolvedValue({
      id: 1, status: "under_review", user_id: 5, transaction_id: 100, user_email: "user@example.com",
    });
    mockTransactionFindById.mockResolvedValue({ id: 100, amount: 42, user_id: 5 });
    mockWalletGetByUserId.mockResolvedValue({ id: 7, user_id: 5 });
    mockDisputeUpdate.mockResolvedValue({ id: 1, status: "resolved", outcome: "upheld" });

    const req = {
      params: { id: "1" },
      body: { status: "resolved", outcome: "upheld", adminNotes: "confirmed unauthorized" },
      user: { id: 9 },
    };
    const res = makeRes();

    await updateDispute(req, res);

    expect(mockWalletCredit).toHaveBeenCalledWith(7, 42);
    expect(mockDisputeUpdate).toHaveBeenCalledWith("1", expect.objectContaining({
      status: "resolved",
      outcome: "upheld",
      resolved_by: 9,
    }));
    expect(mockNotificationCreate).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 5,
      type: "dispute_resolved",
    }));
    expect(mockSendEmail).toHaveBeenCalledWith("user@example.com", expect.any(String), expect.stringContaining("refund"));
    expect(mockAuditLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ refunded: true, outcome: "upheld" }),
    }));
  });

  it("does not refund when a dispute is rejected", async () => {
    mockDisputeFindById.mockResolvedValue({
      id: 1, status: "under_review", user_id: 5, transaction_id: 100, user_email: "user@example.com",
    });
    mockDisputeUpdate.mockResolvedValue({ id: 1, status: "resolved", outcome: "rejected" });

    const req = {
      params: { id: "1" },
      body: { status: "resolved", outcome: "rejected" },
      user: { id: 9 },
    };
    const res = makeRes();

    await updateDispute(req, res);

    expect(mockWalletCredit).not.toHaveBeenCalled();
    expect(mockDisputeUpdate).toHaveBeenCalledWith("1", expect.objectContaining({ outcome: "rejected" }));
    expect(mockNotificationCreate).toHaveBeenCalled();
  });
});

describe("disputeAdmin routes — authorization", () => {
  it("rejects non-admin requests with 403", async () => {
    const router = (await import("../routes/disputeAdmin.js")).default;
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 1, role: "user" };
      next();
    });
    app.use("/admin/disputes", router);

    const res = await request(app).get("/admin/disputes");

    expect(res.status).toBe(403);
  });
});
