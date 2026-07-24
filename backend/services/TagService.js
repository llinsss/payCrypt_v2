import knex from 'knex';
import config from '../knexfile.js';
const db = knex(config);

class TagService {
    async createTag(tag, stellarAddress) {
        const formattedTag = tag.toLowerCase(); // Case-insensitive storage

        // Check if tag exists
        const existing = await db('stellar_tags').where({ tag: formattedTag }).first();
        if (existing) {
            throw new Error('Tag already exists');
        }

        // Insert new tag with pending status
        const [id] = await db('stellar_tags').insert({
            tag: formattedTag,
            stellar_address: stellarAddress,
            status: 'pending'
        }).returning('id'); // PG requires returning for ID

        return { id, tag: formattedTag, stellarAddress, status: 'pending' };
    }

    async checkAvailability(tag) {
        const formattedTag = tag.toLowerCase();

        const existing = await db('stellar_tags').where({ tag: formattedTag }).first();

        if (!existing) {
            return {
                tag: formattedTag,
                available: true,
                suggestions: []
            };
        }

        // Generate suggestions
        const suggestions = [];
        const base = formattedTag.substring(0, 15); // truncate to allow adding suffix

        // Strategy: Add numbers and common suffixes
        const candidates = [
            `${base}1`,
            `${base}10`,
            `${base}_ng`,
            `${base}_x`,
            `${base}2024`
        ];

        // Check which candidates are available
        // Optimization: checking one by one or in bulk. Bulk is better.
        const taken = await db('stellar_tags')
            .whereIn('tag', candidates)
            .pluck('tag');

        const takenSet = new Set(taken);

        for (const candidate of candidates) {
            if (!takenSet.has(candidate)) {
                suggestions.push(candidate);
                if (suggestions.length >= 3) break; // Limit to 3 suggestions
            }
        }

        return {
            tag: formattedTag,
            available: false,
            suggestions
        };
    }

    async resolveTag(tag) {
        const formattedTag = tag.toLowerCase();
        // Only resolve active tags for payments
        const mapping = await db('stellar_tags').where({ tag: formattedTag, status: 'active' }).first();
        return mapping;
    }

    async confirmTag(tag) {
        const formattedTag = tag.toLowerCase();

        const result = await db('stellar_tags')
            .where({ tag: formattedTag })
            .update({
                status: 'active',
                confirmed_at: db.fn.now(),
                updated_at: db.fn.now()
            })
            .returning('*');

        return result[0];
    }

    async failTag(tag, reason) {
        const formattedTag = tag.toLowerCase();

        const result = await db('stellar_tags')
            .where({ tag: formattedTag })
            .update({
                status: 'failed',
                failure_reason: reason,
                updated_at: db.fn.now()
            })
            .returning('*');

        return result[0];
    }

    async transferTag(tag, newStellarAddress) {
        const formattedTag = tag.toLowerCase();

        // Check if tag exists
        const mapping = await db('stellar_tags').where({ tag: formattedTag }).first();
        if (!mapping) {
            throw new Error('Tag not found');
        }

        // Update address
        await db('stellar_tags')
            .where({ tag: formattedTag })
            .update({
                stellar_address: newStellarAddress,
                updated_at: db.fn.now()
            });

        return { tag: formattedTag, stellarAddress: newStellarAddress };
    }
}

export default new TagService();
