import Joi from 'joi';

/**
 * Payment validation schemas for @tag-to-@tag transfers
 */

export const processPaymentSchema = Joi.object({
  senderTag: Joi.string()
    .pattern(/^[a-zA-Z0-9_]{3,20}$/)
    .required()
    .messages({
      'string.pattern.base': 'Sender tag must be 3-20 alphanumeric characters (underscores allowed)',
      'any.required': 'Sender tag is required'
    }),

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

  notes: Joi.string()
    .max(500)
    .allow(null, '')
    .messages({
      'string.max': 'Notes must be 500 characters or less'
    }),

  idempotencyKey: Joi.string()
    .max(255)
    .allow(null, '')
    .messages({
      'string.max': 'Idempotency key must be 255 characters or less'
    })
}).unknown(false);

const batchPaymentItemSchema = Joi.object({
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

  notes: Joi.string()
    .max(1000)
    .allow(null, '')
    .messages({
      'string.max': 'Notes must be 1000 characters or less'
    })
}).unknown(false);

export const batchPaymentSchema = Joi.object({
  senderTag: Joi.string()
    .pattern(/^[a-zA-Z0-9_]{3,20}$/)
    .required()
    .messages({
      'string.pattern.base': 'Sender tag must be 3-20 alphanumeric characters (underscores allowed)',
      'any.required': 'Sender tag is required'
    }),

  payments: Joi.array()
    .items(batchPaymentItemSchema)
    .min(1)
    .max(100)
    .required()
    .messages({
      'array.base': 'Payments must be an array',
      'array.min': 'At least one payment is required',
      'array.max': 'A batch cannot contain more than 100 payments',
      'any.required': 'Payments are required'
    }),

  atomic: Joi.boolean()
    .default(true)
    .messages({
      'boolean.base': 'Atomic must be a boolean'
    }),

  asset: Joi.string()
    .pattern(/^[A-Z0-9]{1,12}$/)
    .default('XLM')
    .messages({
      'string.pattern.base': 'Asset code must be 1-12 uppercase alphanumeric characters'
    }),

  assetIssuer: Joi.when('asset', {
    is: 'XLM',
    then: Joi.string().allow(null, ''),
    otherwise: Joi.string()
      .pattern(/^G[A-Z0-9]{55}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid Stellar address format for asset issuer',
        'any.required': 'Asset issuer required for custom assets'
      })
  }),

  memo: Joi.string()
    .max(28)
    .allow(null, '')
    .messages({
      'string.max': 'Memo must be 28 characters or less'
    }),

}).unknown(false);

export const paymentLimitsSchema = Joi.object({
  maxAmount: Joi.number().positive(),
  minAmount: Joi.number().positive(),
  baseFeePercentage: Joi.number().positive(),
  minFee: Joi.number().positive()
});

export const transactionHistoryQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  from: Joi.string().isoDate().allow(null, ''),
  to: Joi.string().isoDate().allow(null, ''),
  type: Joi.string()
    .valid('payment', 'credit', 'debit')
    .allow(null, ''),
  sortBy: Joi.string()
    .valid('created_at', 'amount', 'usd_value', 'type', 'status')
    .default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  noteSearch: Joi.string().max(100).allow(null, '')
});
