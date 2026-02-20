import Joi from 'joi';

/**
 * Validation schemas for scheduled payments
 */

export const createScheduledPaymentSchema = Joi.object({
    recipientTag: Joi.string()
        .pattern(/^[a-zA-Z0-9_]{3,20}$/)
        .required()
        .messages({
            'string.pattern.base': 'Recipient tag must be 3-20 alphanumeric characters (underscores allowed)',
            'any.required': 'Recipient tag is required'
        }),

    amount: Joi.number()
        .positive()
        .precision(7)
        .required()
        .messages({
            'number.positive': 'Amount must be greater than 0',
            'any.required': 'Amount is required'
        }),

    asset: Joi.string()
        .pattern(/^[A-Z0-9]{1,12}$/)
        .default('XLM')
        .messages({
            'string.pattern.base': 'Asset code must be 1-12 uppercase alphanumeric characters'
        }),

    assetIssuer: Joi.string()
        .pattern(/^G[A-Z0-9]{55}$/)
        .allow(null, '')
        .messages({
            'string.pattern.base': 'Invalid Stellar address format for asset issuer'
        }),

    memo: Joi.string()
        .max(28)
        .allow(null, '')
        .messages({
            'string.max': 'Memo must be 28 characters or less'
        }),

    scheduledAt: Joi.date()
        .iso()
        .greater('now')
        .required()
        .custom((value, helpers) => {
            const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            if (new Date(value) > maxDate) {
                return helpers.error('date.max');
            }
            return value;
        })
        .messages({
            'date.greater': 'Scheduled date must be in the future',
            'date.max': 'Scheduled date cannot be more than 30 days from now',
            'any.required': 'Scheduled date is required',
            'date.format': 'Scheduled date must be a valid ISO date'
        }),
}).unknown(false);

export const scheduledPaymentQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    status: Joi.string()
        .valid('pending', 'processing', 'completed', 'failed', 'cancelled')
        .allow(null, '')
        .messages({
            'any.only': 'Status must be one of: pending, processing, completed, failed, cancelled'
        }),
});
