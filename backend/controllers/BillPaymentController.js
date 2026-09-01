import BillPaymentService from '../services/BillPaymentService.js';
import Joi from 'joi';

const billPaymentSchema = Joi.object({
    category: Joi.string()
        .valid('airtime', 'data', 'electricity', 'cable_tv')
        .required()
        .messages({
            'any.required': 'Category is required',
            'any.only': 'Category must be one of: airtime, data, electricity, cable_tv'
        }),
    provider: Joi.string()
        .required()
        .messages({
            'any.required': 'Provider is required'
        }),
    phone: Joi.string()
        .min(10)
        .max(20)
        .required()
        .messages({
            'any.required': 'Phone/account number is required',
            'string.min': 'Phone/account number must be at least 10 digits',
            'string.max': 'Phone/account number must not exceed 20 characters'
        }),
    amount: Joi.number()
        .positive()
        .required()
        .messages({
            'any.required': 'Amount is required',
            'number.positive': 'Amount must be greater than 0'
        }),
    recipient: Joi.string()
        .optional()
        .allow(null, '')
        .messages({
            'string.base': 'Recipient must be a string'
        })
});

class BillPaymentController {
    async getCategories(req, res) {
        try {
            const categories = await BillPaymentService.getCategories();
            res.status(200).json({
                status: 'success',
                data: categories
            });
        } catch (error) {
            console.error('Get Categories Error:', error);
            res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    }

    async getProviders(req, res) {
        try {
            const { category } = req.params;

            if (!category) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Category parameter is required'
                });
            }

            const providers = await BillPaymentService.getProvidersForCategory(category);

            if (providers.length === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'No providers found for this category'
                });
            }

            res.status(200).json({
                status: 'success',
                data: providers
            });
        } catch (error) {
            console.error('Get Providers Error:', error);
            res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    }

    async pay(req, res) {
        try {
            const { error, value } = billPaymentSchema.validate(req.body);
            if (error) {
                return res.status(400).json({
                    status: 'error',
                    message: error.details[0].message
                });
            }

            const result = await BillPaymentService.processBillPayment({
                userId: req.user.id,
                category: value.category,
                provider: value.provider,
                phone: value.phone,
                amount: value.amount,
                recipient: value.recipient
            });

            res.status(200).json({
                status: 'success',
                data: result
            });
        } catch (error) {
            console.error('Bill Payment Error:', error);

            if (error.message === 'Insufficient wallet balance') {
                return res.status(402).json({
                    status: 'error',
                    message: error.message
                });
            }

            if (error.message === 'User not found') {
                return res.status(404).json({
                    status: 'error',
                    message: error.message
                });
            }

            res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    }
}

export default new BillPaymentController();
