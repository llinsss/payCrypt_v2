import TagService from '../services/TagService.js';
import Joi from 'joi';

const tagSchema = Joi.object({
    tag: Joi.string()
        .pattern(/^[a-zA-Z0-9_]{3,20}$/)
        .required()
        .messages({
            'string.pattern.base': 'Tag must be alphanumeric with underscores, 3-20 characters long'
        }),
    stellarAddress: Joi.string().length(56).required() // Basic length check for Stellar address
});

class TagController {
    async create(req, res) {
        try {
            const { error, value } = tagSchema.validate(req.body);
            if (error) {
                return res.status(400).json({ status: 'error', message: error.details[0].message });
            }

            const result = await TagService.createTag(value.tag, value.stellarAddress);

            res.status(201).json({
                status: 'success',
                data: result
            });
        } catch (error) {
            if (error.message === 'Tag already exists') {
                return res.status(409).json({ status: 'error', message: error.message });
            }
            console.error('Create Tag Error:', error);
            res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    }

    async resolve(req, res) {
        try {
            const { tag } = req.params;
            // Basic validation for param
            if (!/^[a-zA-Z0-9_@]{3,21}$/.test(tag)) { // loose check to allow optional @
                return res.status(400).json({ status: 'error', message: 'Invalid tag format' });
            }

            // Remove @ if present
            const cleanTag = tag.startsWith('@') ? tag.slice(1) : tag;

            const mapping = await TagService.resolveTag(cleanTag);

            if (!mapping) {
                return res.status(404).json({ status: 'error', message: 'Tag not found' });
            }

            res.status(200).json({
                status: 'success',
                data: mapping
            });
        } catch (error) {
            console.error('Resolve Tag Error:', error);
            res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    }

    async transfer(req, res) {
        try {
            const { tag } = req.params;
            const { newStellarAddress } = req.body;

            if (!newStellarAddress || newStellarAddress.length !== 56) {
                return res.status(400).json({ status: 'error', message: 'Invalid new stellar address' });
            }

            const cleanTag = tag.startsWith('@') ? tag.slice(1) : tag;

            const result = await TagService.transferTag(cleanTag, newStellarAddress);

            res.status(200).json({
                status: 'success',
                data: result
            });
        } catch (error) {
            if (error.message === 'Tag not found') {
                return res.status(404).json({ status: 'error', message: error.message });
            }
            console.error('Transfer Tag Error:', error);
            res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    }
}

export default new TagController();
