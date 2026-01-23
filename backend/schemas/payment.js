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

  senderSecret: Joi.string()
    .pattern(/^S[A-Z0-9]{55}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid Stellar secret key format',
      'any.required': 'Sender secret key is required'
    }),

  additionalSecrets: Joi.array()
    .items(
      Joi.string()
        .pattern(/^S[A-Z0-9]{55}$/)
        .messages({
          'string.pattern.base': 'Invalid Stellar secret key format in additional secrets'
        })
    )
    .default([])
    .messages({
      'array.base': 'Additional secrets must be an array'
    })
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
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});
