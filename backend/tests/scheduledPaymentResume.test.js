import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockFindById = jest.fn();
const mockResume = jest.fn();
const mockNotificationCreate = jest.fn();

jest.unstable_mockModule("../models/ScheduledPayment.js", () => ({
  default: {
    findById: mockFindById,
    resume: mockResume,
  },
}));

jest.unstable_mockModule("../models/Notification.js", () => ({
  default: {
    create: mockNotificationCreate,
  },
}));

let resumeScheduledPayment;

beforeEach(async () => {
  jest.clearAllMocks();
  ({ resumeScheduledPayment } = await import("../controllers/scheduledPaymentController.js"));
});

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe("scheduledPaymentController.resumeScheduledPayment", () => {
  it("resumes a paused payment owned by the requesting user", async () => {
    mockFindById.mockResolvedValue({
      id: 5, user_id: 1, status: "paused", amount: 10, asset: "XLM", recipient_tag: "bob",
    });
    mockResume.mockResolvedValue({ id: 5, status: "pending", failure_count: 0 });

    const req = { params: { id: "5" }, user: { id: 1 } };
    const res = makeRes();

    await resumeScheduledPayment(req, res);

    expect(mockResume).toHaveBeenCalledWith("5");
    expect(mockNotificationCreate).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 1,
      title: "Scheduled Payment Resumed",
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      scheduledPayment: { id: 5, status: "pending", failure_count: 0 },
    }));
  });

  it("returns 404 when the payment does not exist", async () => {
    mockFindById.mockResolvedValue(null);

    const req = { params: { id: "999" }, user: { id: 1 } };
    const res = makeRes();

    await resumeScheduledPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockResume).not.toHaveBeenCalled();
  });

  it("returns 403 when the payment belongs to another user", async () => {
    mockFindById.mockResolvedValue({ id: 5, user_id: 2, status: "paused" });

    const req = { params: { id: "5" }, user: { id: 1 } };
    const res = makeRes();

    await resumeScheduledPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockResume).not.toHaveBeenCalled();
  });

  it("returns 400 when the payment is not paused", async () => {
    mockFindById.mockResolvedValue({ id: 5, user_id: 1, status: "pending" });

    const req = { params: { id: "5" }, user: { id: 1 } };
    const res = makeRes();

    await resumeScheduledPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockResume).not.toHaveBeenCalled();
  });
});
