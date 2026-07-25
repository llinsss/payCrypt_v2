import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { verifyToken } from "../config/jwt.js";
import { createHash } from 'crypto';

/**
 * Count total field selections in an AST document to enforce a complexity limit.
 * Avoids `graphql-query-complexity` which brings a conflicting graphql version.
 */
const countFieldSelections = (selectionSet) => {
    let count = 0;
    if (!selectionSet) return 0;
    for (const selection of selectionSet.selections) {
        count += 1;
        if (selection.selectionSet) {
            count += countFieldSelections(selection.selectionSet);
        }
    }
    return count;
};

/**
 * Calculate query depth (nesting level) to prevent deep nesting attacks
 */
const calculateQueryDepth = (selectionSet, currentDepth = 0) => {
    if (!selectionSet || selectionSet.selections.length === 0) {
        return currentDepth;
    }
    let maxDepth = currentDepth;
    for (const selection of selectionSet.selections) {
        if (selection.selectionSet) {
            const depth = calculateQueryDepth(selection.selectionSet, currentDepth + 1);
            maxDepth = Math.max(maxDepth, depth);
        }
    }
    return maxDepth;
};

/**
 * Simple rate limiter using in-memory store with IP-based tracking
 */
class RateLimiter {
    constructor(maxRequests = 100, windowMs = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.store = new Map();
    }

    isLimited(ip) {
        const now = Date.now();
        const key = ip;

        if (!this.store.has(key)) {
            this.store.set(key, { count: 1, resetTime: now + this.windowMs });
            return false;
        }

        const record = this.store.get(key);
        if (now > record.resetTime) {
            this.store.set(key, { count: 1, resetTime: now + this.windowMs });
            return false;
        }

        record.count++;
        return record.count > this.maxRequests;
    }
}

/**
 * Sanitize GraphQL input values to prevent XSS
 */
const sanitizeInput = (value) => {
    if (typeof value === 'string') {
        return value
            .replace(/[<>\"']/g, (char) => {
                const escapeMap = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
                return escapeMap[char];
            });
    }
    return value;
};

/**
 * Initialize Apollo Server and mount it on the Express app.
 * @param {import('express').Application} app
 * @param {object | null} db               - optional knex instance; imported lazily if not provided
 * @param {object | null} httpServer       - optional http.Server for drain plugin
 */
export const initApollo = async (app, db = null, httpServer = null) => {
    // Lazily import db only when not injected (avoids pulling winston in tests)
    if (!db) {
        const mod = await import('../config/database.js');
        db = mod.default;
    }

    const plugins = [];
    const rateLimiter = new RateLimiter(100, 60000);

    if (httpServer) {
        const { ApolloServerPluginDrainHttpServer } = await import('@apollo/server/plugin/drainHttpServer');
        plugins.push(ApolloServerPluginDrainHttpServer({ httpServer }));
    }

    const isProduction = process.env.NODE_ENV === 'production';

    const apolloServer = new ApolloServer({
        typeDefs,
        resolvers,
        introspection: !isProduction,
        plugins: [
            ...plugins,
            {
                async requestDidStart({ request }) {
                    return {
                        async didResolveOperation({ request, document }) {
                            let complexity = 0;
                            let depth = 0;
                            for (const def of document.definitions) {
                                if (def.selectionSet) {
                                    complexity += countFieldSelections(def.selectionSet);
                                    depth = Math.max(depth, calculateQueryDepth(def.selectionSet));
                                }
                            }
                            if (complexity > 100) {
                                console.warn(`🚨 GraphQL query rejected: complexity ${complexity}`);
                                throw new Error(`Query is too complex: ${complexity}. Maximum allowed complexity: 100`);
                            }
                            if (depth > 7) {
                                console.warn(`🚨 GraphQL query rejected: depth ${depth}`);
                                throw new Error(`Query depth ${depth} exceeds maximum allowed depth: 7`);
                            }
                        },
                    };
                },
            },
        ],
    });

    await apolloServer.start();

    // NOTE: express.json() must be applied alongside expressMiddleware
    const { default: express } = await import('express');

    app.use(
        '/graphql',
        express.json({ limit: '10mb' }),
        (req, res, next) => {
            const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
            if (rateLimiter.isLimited(clientIp)) {
                return res.status(429).json({ error: 'Too many requests' });
            }
            next();
        },
        expressMiddleware(apolloServer, {
            context: async ({ req }) => {
                let user = null;
                const authHeader = req.headers.authorization;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const token = authHeader.split(' ')[1];
                    try {
                        const decoded = verifyToken(token);
                        const userId = decoded.userId || decoded.id;
                        user = await db('users').where({ id: userId }).first();
                    } catch (e) {
                        // Invalid token — context.user stays null
                    }
                }
                return { user, sanitizeInput };
            },
        })
    );

    return apolloServer;
};
