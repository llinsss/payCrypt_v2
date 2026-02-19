import Joi from "joi";

/**
 * Schema for sending funds to another user via their @tag.
 */
export const sendToTagSchema = Joi.object({
    receiver_tag: Joi.string()
        .pattern(/^[a-zA-Z0-9_]{3,20}$/)
        .required()
        .messages({
            "string.pattern.base": "Receiver tag must be 3-20 alphanumeric characters (underscores allowed)",
            "any.required": "Receiver tag is required",
            "string.empty": "Receiver tag cannot be empty",
        }),

    amount: Joi.number()
        .positive()
        .required()
        .messages({
            "number.positive": "Amount must be greater than 0",
            "number.base": "Amount must be a valid number",
            "any.required": "Amount is required",
        }),

    balance_id: Joi.number()
        .integer()
        .positive()
        .required()
        .messages({
            "number.integer": "Balance ID must be a whole number",
            "number.positive": "Balance ID must be a positive number",
            "number.base": "Balance ID must be a valid number",
            "any.required": "Balance ID is required",
        }),
});

/**
 * Schema for sending funds to an external blockchain wallet address.
 */
export const sendToWalletSchema = Joi.object({
    receiver_address: Joi.string()
        .min(10)
        .required()
        .messages({
            "string.min": "Receiver address appears to be too short",
            "any.required": "Receiver address is required",
            "string.empty": "Receiver address cannot be empty",
        }),

    amount: Joi.number()
        .positive()
        .required()
        .messages({
            "number.positive": "Amount must be greater than 0",
            "number.base": "Amount must be a valid number",
            "any.required": "Amount is required",
        }),

    balance_id: Joi.number()
        .integer()
        .positive()
        .required()
        .messages({
            "number.integer": "Balance ID must be a whole number",
            "number.positive": "Balance ID must be a positive number",
            "number.base": "Balance ID must be a valid number",
            "any.required": "Balance ID is required",
        }),
});
