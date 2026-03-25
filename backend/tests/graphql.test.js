import request from "supertest";
import express from "express";
import { initApollo } from "../graphql/apollo.js";
import knex from "knex";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

// Create a direct knex connection — bypasses config/database.js which pulls in winston
const db = knex({
    client: "pg",
    connection: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD || "",
    },
});

let validToken;
let testUser;

const app = express();
app.use(express.json());

beforeAll(async () => {
    // Bootstrap Apollo with our own db instance (no winston chain)
    await initApollo(app, db);

    // Find or create a test user
    testUser = await db("users").first();
    if (!testUser) {
        const [id] = await db("users").insert({
            email: "graphql_test@example.com",
            password: "hashedpassword",
            tag: "graphql_tester",
            address: "0xgraphql_" + Date.now(),
            is_verified: true,
        }).returning("id");
        testUser = await db("users").where({ id }).first();
    }

    validToken = jwt.sign(
        { userId: testUser.id },
        process.env.JWT_SECRET || "default_secret",
        { expiresIn: "10h" }
    );
});

afterAll(async () => {
    await db.destroy();
});

describe("GraphQL API Integration", () => {
    it("should block unauthenticated queries to 'me'", async () => {
        const response = await request(app)
            .post("/graphql")
            .send({ query: "query { me { id email } }" });

        expect(response.status).toBe(200);
        expect(response.body.errors).toBeDefined();
        expect(response.body.errors[0].message).toBe("Not authenticated");
    });

    it("should return user data for authenticated queries to 'me'", async () => {
        const response = await request(app)
            .post("/graphql")
            .set("Authorization", `Bearer ${validToken}`)
            .send({ query: "query { me { id email tag } }" });

        expect(response.status).toBe(200);
        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.me.email).toBe(testUser.email);
    });

    it("should enforce query complexity limits", async () => {
        // 105 aliased fields, each with complexity 1 → total 105 > limit of 100
        let complexQuery = "query { ";
        for (let i = 0; i < 105; i++) {
            complexQuery += `alias${i}: me { id } `;
        }
        complexQuery += "}";

        const response = await request(app)
            .post("/graphql")
            .set("Authorization", `Bearer ${validToken}`)
            .send({ query: complexQuery });

        expect(response.body.errors).toBeDefined();
        expect(response.body.errors[0].message).toContain("Query is too complex");
    });
});
