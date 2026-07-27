import {
    checkAllDependencies,
    getConnectionPoolStats,
} from "../utils/dbHealth.js";
import { checkStellarStreamHealth } from "../utils/stellarStreamHealth.js";

export const getHealth = async (req, res) => {
    const health = {
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || process.env.APP_VERSION || "1.0.0",
        checks: {
            database: { status: "unknown" },
            redis: { status: "unknown" },
            stellar: { status: "unknown" },
            stellarStream: { status: "unknown" },
        },
    };

    try {
        const [dependencies, streamHealth] = await Promise.all([
            checkAllDependencies(),
            checkStellarStreamHealth(),
        ]);

        health.checks.database = {
            status: dependencies.database.healthy ? "up" : "down",
            latencyMs: dependencies.database.latencyMs,
            message: dependencies.database.message,
            pool: getConnectionPoolStats(),
        };

        health.checks.redis = {
            status: dependencies.redis.healthy ? "up" : "down",
            latencyMs: dependencies.redis.latencyMs,
            message: dependencies.redis.message,
        };

        health.checks.stellar = {
            status: dependencies.stellar.healthy ? "up" : "down",
            latencyMs: dependencies.stellar.latencyMs,
            message: dependencies.stellar.message,
            details: dependencies.stellar.details || undefined,
        };

        health.checks.stellarStream = {
            status: streamHealth.healthy ? "up" : "down",
            running: streamHealth.running,
            connected: streamHealth.connected,
            latencyMs: streamHealth.latencyMs,
            message: streamHealth.message,
            details: streamHealth.details || undefined,
        };

        const criticalChecks = [
            dependencies.database.healthy,
            dependencies.redis.healthy,
            streamHealth.healthy,
        ];
        
        const allCriticalDown = criticalChecks.every(check => !check);
        const someCriticalDown = criticalChecks.some(check => !check);

        if (allCriticalDown) {
            health.status = "down";
        } else if (someCriticalDown) {
            health.status = "degraded";
        }
    } catch (error) {
        console.error("Health check failed:", error);
        health.status = "down";
        health.error = error.message;
    }

    const statusCode = health.status === "ok" ? 200 : 503;
    res.status(statusCode).json(health);
};

export const getReadiness = async (req, res) => {
    const readiness = {
        status: "ready",
        timestamp: new Date().toISOString(),
        checks: {},
    };

    try {
        const dependencies = await checkAllDependencies();

        readiness.checks.database = dependencies.database.healthy ? "up" : "down";
        readiness.checks.redis = dependencies.redis.healthy ? "up" : "down";

        const isReady = dependencies.database.healthy && dependencies.redis.healthy;

        if (!isReady) {
            readiness.status = "not_ready";
        }
    } catch (error) {
        console.error("Readiness check failed:", error);
        readiness.status = "not_ready";
        readiness.error = error.message;
    }

    const statusCode = readiness.status === "ready" ? 200 : 503;
    res.status(statusCode).json(readiness);
};

export const getLiveness = (req, res) => {
    res.status(200).json({
        status: "alive",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        pid: process.pid,
        memoryUsage: {
            rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
            heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
            heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
        },
    });
};