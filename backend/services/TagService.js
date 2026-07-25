import knex from 'knex';
import config from '../knexfile.js';
import redis from '../config/redis.js';
const db = knex(config);

class TagService {
    async createTag(tag, stellarAddress) {
        const formattedTag = tag.toLowerCase(); // Case-insensitive storage

        // Check if tag exists
        const existing = await db('stellar_tags').where({ tag: formattedTag }).first();
        if (existing) {
            throw new Error('Tag already exists');
        }

        // Insert new tag
        const [id] = await db('stellar_tags').insert({
            tag: formattedTag,
            stellar_address: stellarAddress
        }).returning('id'); // PG requires returning for ID

        return { id, tag: formattedTag, stellarAddress };
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
        const mapping = await db('stellar_tags').where({ tag: formattedTag }).first();
        return mapping;
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

    async searchTags(query) {
        const formattedQuery = query.toLowerCase().trim();

        if (!formattedQuery || formattedQuery.length < 1) {
            return [];
        }

        const cacheKey = `tag_search:${formattedQuery}`;
        const cacheTTL = 300; // 5 minutes

        try {
            // Try to get from cache
            const cached = await redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (cacheError) {
            console.warn('Redis cache read error:', cacheError.message);
            // Continue with database query if cache fails
        }

        // Query database for matching tags
        const results = await db('stellar_tags')
            .where('tag', 'like', `${formattedQuery}%`)
            .limit(10)
            .select('id', 'tag', 'stellar_address', 'created_at');

        const formatted = results.map(r => ({
            id: r.id,
            tag: r.tag,
            stellarAddress: r.stellar_address,
            createdAt: r.created_at
        }));

        // Store in cache
        try {
            await redis.setEx(cacheKey, cacheTTL, JSON.stringify(formatted));
        } catch (cacheError) {
            console.warn('Redis cache write error:', cacheError.message);
        }

        return formatted;
    }
}

export default new TagService();
