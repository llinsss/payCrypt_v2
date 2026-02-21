import Joi from "joi";

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

    evidence_url: Joi.string().uri().allow(null, "").messages({
        "string.uri": "Evidence URL must be a valid URI",
    }),
}).unknown(false);

export const disputeQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    status: Joi.string()
        .valid("open", "under_review", "resolved", "closed")
        .allow(null, "")
        .messages({
            "any.only": "Status must be one of: open, under_review, resolved, closed",
        }),
});

export const updateDisputeStatusSchema = Joi.object({
    status: Joi.string()
        .valid("under_review", "resolved", "closed")
        .required()
        .messages({
            "any.only": "Status must be one of: under_review, resolved, closed",
            "any.required": "Status is required",
        }),
    resolution_note: Joi.string().allow(null, ""),
}).unknown(false);
