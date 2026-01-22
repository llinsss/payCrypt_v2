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

        // Insert new tag
        const [id] = await db('stellar_tags').insert({
            tag: formattedTag,
            stellar_address: stellarAddress
        }).returning('id'); // PG requires returning for ID

        return { id, tag: formattedTag, stellarAddress };
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
}

export default new TagService();
