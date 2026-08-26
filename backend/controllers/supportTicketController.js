import db from "../config/database.js";

// ─── Allowed enum values ─────────────────────────────────

const ALLOWED_ISSUE_TYPES = [
  "failed_transaction",
  "kyc_verification",
  "deposit_issue",
  "withdrawal_issue",
  "account_access",
  "other",
];

const ALLOWED_STATUSES = ["open", "in_progress", "resolved", "closed"];
const ALLOWED_PRIORITIES = ["low", "medium", "high"];

// ─── Create a support ticket ────────────────────────────

/**
 * POST /support-tickets
 * Body: { subject, description, issue_type, priority?, transaction_id? }
 */
export const createSupportTicket = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      subject,
      description,
      issue_type,
      priority = "medium",
      transaction_id = null,
    } = req.body;

    // ── Input validation ──────────────────────────────────
    if (!subject || typeof subject !== "string" || subject.trim().length < 5) {
      return res
        .status(400)
        .json({ error: "Subject is required and must be at least 5 characters." });
    }

    if (
      !description ||
      typeof description !== "string" ||
      description.trim().length < 20
    ) {
      return res.status(400).json({
        error: "Description is required and must be at least 20 characters.",
      });
    }

    if (!ALLOWED_ISSUE_TYPES.includes(issue_type)) {
      return res.status(400).json({
        error: `Invalid issue_type. Allowed values: ${ALLOWED_ISSUE_TYPES.join(", ")}`,
      });
    }

    if (!ALLOWED_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        error: `Invalid priority. Allowed values: ${ALLOWED_PRIORITIES.join(", ")}`,
      });
    }

    // ── Persist ───────────────────────────────────────────
    const [id] = await db("support_tickets").insert({
      user_id: userId,
      subject: subject.trim(),
      description: description.trim(),
      issue_type,
      priority,
      transaction_id: transaction_id
        ? String(transaction_id).trim() || null
        : null,
      status: "open",
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    const ticket = await db("support_tickets").where({ id }).first();

    return res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    console.error("[SupportTickets] createSupportTicket error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

// ─── List tickets for the authenticated user ────────────

/**
 * GET /support-tickets?limit=20&offset=0
 */
export const getSupportTickets = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const [tickets, [{ total }]] = await Promise.all([
      db("support_tickets")
        .where({ user_id: userId })
        .orderBy("created_at", "desc")
        .limit(limit)
        .offset(offset),
      db("support_tickets")
        .where({ user_id: userId })
        .count("id as total"),
    ]);

    return res.status(200).json({
      success: true,
      data: tickets,
      pagination: { total: Number(total), limit, offset },
    });
  } catch (error) {
    console.error("[SupportTickets] getSupportTickets error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

// ─── Get a single ticket by ID ──────────────────────────

/**
 * GET /support-tickets/:id
 */
export const getSupportTicketById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const ticket = await db("support_tickets")
      .where({ id, user_id: userId })
      .first();

    if (!ticket) {
      return res.status(404).json({ error: "Support ticket not found." });
    }

    return res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    console.error("[SupportTickets] getSupportTicketById error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

// ─── Update ticket status (admin or owner closing a ticket) ─

/**
 * PATCH /support-tickets/:id/status
 * Body: { status }
 */
export const updateSupportTicketStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";
    const { id } = req.params;
    const { status } = req.body;

    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(", ")}`,
      });
    }

    const query = db("support_tickets").where({ id });
    // Non-admins can only access their own tickets
    if (!isAdmin) {
      query.andWhere({ user_id: userId });
    }

    const ticket = await query.first();
    if (!ticket) {
      return res.status(404).json({ error: "Support ticket not found." });
    }

    const updates = {
      status,
      updated_at: db.fn.now(),
    };

    if (status === "resolved") {
      updates.resolved_at = db.fn.now();
    }

    await db("support_tickets").where({ id }).update(updates);

    const updated = await db("support_tickets").where({ id }).first();
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error("[SupportTickets] updateSupportTicketStatus error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};
