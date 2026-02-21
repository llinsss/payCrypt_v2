import Joi from "joi";

// ─── Dispute Categories & Priorities ─────────────────────

const DISPUTE_CATEGORIES = [
    "unauthorized",
    "duplicate",
    "wrong_amount",
    "not_received",
    "fraud",
    "other",
];

const DISPUTE_PRIORITIES = ["low", "medium", "high", "critical"];

const DISPUTE_STATUSES = ["open", "under_review", "escalated", "resolved", "closed"];

// ─── Create Dispute ──────────────────────────────────────

export const createDisputeSchema = Joi.object({
    transaction_id: Joi.number().integer().required().messages({
        "number.base": "Transaction ID must be a number",
        "any.required": "Transaction ID is required",
    }),

    reason: Joi.string().max(255).required().messages({
        "string.base": "Reason must be a text string",
        "any.required": "Reason is required",
        "string.max": "Reason must be 255 characters or less",
    }),

    description: Joi.string().required().messages({
        "string.base": "Description must be a text string",
        "any.required": "Description is required",
    }),

    category: Joi.string()
        .valid(...DISPUTE_CATEGORIES)
        .required()
        .messages({
            "any.only": `Category must be one of: ${DISPUTE_CATEGORIES.join(", ")}`,
            "any.required": "Category is required",
        }),

    priority: Joi.string()
        .valid(...DISPUTE_PRIORITIES)
        .default("medium")
        .messages({
            "any.only": `Priority must be one of: ${DISPUTE_PRIORITIES.join(", ")}`,
        }),

    evidence_url: Joi.string().uri().allow(null, "").messages({
        "string.uri": "Evidence URL must be a valid URI",
    }),
}).unknown(false);

// ─── Query Disputes ──────────────────────────────────────

export const disputeQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    status: Joi.string()
        .valid(...DISPUTE_STATUSES)
        .allow(null, "")
        .messages({
            "any.only": `Status must be one of: ${DISPUTE_STATUSES.join(", ")}`,
        }),
    priority: Joi.string()
        .valid(...DISPUTE_PRIORITIES)
        .allow(null, "")
        .messages({
            "any.only": `Priority must be one of: ${DISPUTE_PRIORITIES.join(", ")}`,
        }),
    category: Joi.string()
        .valid(...DISPUTE_CATEGORIES)
        .allow(null, "")
        .messages({
            "any.only": `Category must be one of: ${DISPUTE_CATEGORIES.join(", ")}`,
        }),
});

// ─── Update Dispute Status (Admin) ───────────────────────

export const updateDisputeStatusSchema = Joi.object({
    status: Joi.string()
        .valid("under_review", "escalated", "resolved", "closed")
        .required()
        .messages({
            "any.only":
                "Status must be one of: under_review, escalated, resolved, closed",
            "any.required": "Status is required",
        }),
    resolution_note: Joi.string().allow(null, ""),
    assigned_admin_id: Joi.number().integer().allow(null).messages({
        "number.base": "Assigned admin ID must be a number",
    }),
}).unknown(false);

// ─── Escalate Dispute ────────────────────────────────────

export const escalateDisputeSchema = Joi.object({
    reason: Joi.string().min(10).max(1000).required().messages({
        "string.base": "Escalation reason must be a text string",
        "string.min": "Escalation reason must be at least 10 characters",
        "string.max": "Escalation reason must be 1000 characters or less",
        "any.required": "Escalation reason is required",
    }),
}).unknown(false);

// ─── Add Comment ─────────────────────────────────────────

export const addCommentSchema = Joi.object({
    comment: Joi.string().min(1).max(2000).required().messages({
        "string.base": "Comment must be a text string",
        "string.min": "Comment cannot be empty",
        "string.max": "Comment must be 2000 characters or less",
        "any.required": "Comment is required",
    }),
}).unknown(false);

// ─── Assign Dispute (Admin) ──────────────────────────────

export const assignDisputeSchema = Joi.object({
    admin_id: Joi.number().integer().required().messages({
        "number.base": "Admin ID must be a number",
        "any.required": "Admin ID is required",
    }),
}).unknown(false);
