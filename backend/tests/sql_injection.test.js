import request from "supertest";
import express from "express";
import { detectSqlInjection } from "../middleware/validation.js";

// Create an isolated Express app just for testing the middleware
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply our middleware
app.use(detectSqlInjection);

// Dummy endpoints to test against
app.get("/test", (req, res) => res.status(200).json({ status: "ok" }));
app.post("/test", (req, res) => res.status(200).json({ status: "ok" }));

describe("SQL Injection Prevention Middleware", () => {
    it("should allow a legitimate GET request", async () => {
        const res = await request(app).get("/test?sort=date&limit=10");
        expect(res.status).toBe(200);
        expect(res.body.status).toBe("ok");
    });

    it("should allow a legitimate POST request", async () => {
        const res = await request(app)
            .post("/test")
            .send({ email: "user@example.com", password: "SecurePassword123!" });

        expect(res.status).toBe(200);
    });

    it("should block SQL injection in query parameters (OR 1=1)", async () => {
        const res = await request(app).get("/test?sort=1; OR 1=1--");
        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Forbidden: Suspicious input detected");
    });

    it("should block SQL injection in query parameters (UNION SELECT)", async () => {
        const res = await request(app).get("/test?id=1 UNION SELECT * FROM users");
        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Forbidden: Suspicious input detected");
    });

    it("should block SQL injection in request body (DROP TABLE)", async () => {
        const res = await request(app)
            .post("/test")
            .send({ email: "user@example.com", password: "password'; DROP TABLE users; --" });

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Forbidden: Suspicious input detected");
    });

    it("should block SQL injection in request body (UPDATE)", async () => {
        const res = await request(app)
            .post("/test")
            .send({ email: "admin@example.com'; UPDATE users SET role='admin' WHERE id=1; --", password: "password" });

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Forbidden: Suspicious input detected");
    });

    it("should block SQL injection in deeply nested objects", async () => {
        const res = await request(app)
            .post("/test")
            .send({
                user: {
                    profile: {
                        metadata: "safe value",
                        injected: "1; EXEC(xp_cmdshell('dir'));--"
                    }
                }
            });

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Forbidden: Suspicious input detected");
    });
});
