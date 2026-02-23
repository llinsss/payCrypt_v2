import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import jwt from "jsonwebtoken";

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

    if (httpServer) {
        const { ApolloServerPluginDrainHttpServer } = await import('@apollo/server/plugin/drainHttpServer');
        plugins.push(ApolloServerPluginDrainHttpServer({ httpServer }));
    }

    const apolloServer = new ApolloServer({
        typeDefs,
        resolvers,
        plugins: [
            ...plugins,
            {
                async requestDidStart() {
                    return {
                        async didResolveOperation({ request, document }) {
                            let complexity = 0;
                            for (const def of document.definitions) {
                                if (def.selectionSet) {
                                    complexity += countFieldSelections(def.selectionSet);
                                }
                            }
                            if (complexity > 100) {
                                throw new Error(`Query is too complex: ${complexity}. Maximum allowed complexity: 100`);
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
        express.json(),
        expressMiddleware(apolloServer, {
            context: async ({ req }) => {
                let user = null;
                const authHeader = req.headers.authorization;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const token = authHeader.split(' ')[1];
                    try {
                        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
                        const userId = decoded.userId || decoded.id;
                        user = await db('users').where({ id: userId }).first();
                    } catch (e) {
                        // Invalid token — context.user stays null
                    }
                }
                return { user };
            },
        })
    );

    return apolloServer;
};
