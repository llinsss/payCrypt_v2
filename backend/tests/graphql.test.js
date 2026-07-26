import request from "supertest";
import express from "express";
import { initApollo } from "../graphql/apollo.js";
import { signToken } from "../config/jwt.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-1234-test-secret-1234";

const users = [
  { id: 1, email: "graphql_test@example.com", tag: "graphql_tester", role: "user" },
];

function fakeDb(table) {
  if (table !== "users") throw new Error(`Unexpected table ${table}`);
  const query = {
    async first() {
      return users[0] || null;
    },
    where(criteria) {
      return {
        async first() {
          return users.find((user) => Object.entries(criteria).every(([key, value]) => String(user[key]) === String(value))) || null;
        },
      };
    },
    insert(row) {
      const id = users.length + 1;
      users.push({ id, ...row });
      return {
        async returning() {
          return [id];
        },
      };
    },
  };
  return query;
}
fakeDb.destroy = async () => {};

let validToken;
let testUser;
let app;
let server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  server = await initApollo(app, fakeDb);
  testUser = users[0];
  validToken = signToken({ userId: testUser.id }, { expiresIn: "10h" });
});

afterAll(async () => {
  await server?.stop?.();
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
