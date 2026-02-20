import {
    checkAllDependencies,
    getConnectionPoolStats,
} from "../utils/dbHealth.js";

/**
 * GET /api/health
 * Comprehensive health check — returns detailed status of all dependencies
 */
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
        },
    };

    try {
        const dependencies = await checkAllDependencies();

        // Database
        health.checks.database = {
            status: dependencies.database.healthy ? "up" : "down",
            latencyMs: dependencies.database.latencyMs,
            message: dependencies.database.message,
            pool: getConnectionPoolStats(),
        };

        // Redis
        health.checks.redis = {
            status: dependencies.redis.healthy ? "up" : "down",
            latencyMs: dependencies.redis.latencyMs,
            message: dependencies.redis.message,
        };

        // Stellar (external API)
        health.checks.stellar = {
            status: dependencies.stellar.healthy ? "up" : "down",
            latencyMs: dependencies.stellar.latencyMs,
            message: dependencies.stellar.message,
            details: dependencies.stellar.details || undefined,
        };

        // Determine overall status
        if (!dependencies.healthy) {
            const allDown =
                !dependencies.database.healthy &&
                !dependencies.redis.healthy &&
                !dependencies.stellar.healthy;

            health.status = allDown ? "down" : "degraded";
        }
    } catch (error) {
        console.error("Health check failed:", error);
        health.status = "down";
        health.error = error.message;
    }

    const statusCode = health.status === "ok" ? 200 : 503;
    res.status(statusCode).json(health);
};

/**
 * GET /api/health/ready
 * Readiness probe — checks that critical dependencies (database + Redis) are
 * responsive. Used by load balancers to decide whether to route traffic here.
 */
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

        // App is not ready if critical dependencies are down
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

/**
 * GET /api/health/live
 * Liveness probe — confirms the process is alive and the event loop is not frozen.
 * Used by orchestrators (e.g. Kubernetes) to restart unresponsive containers.
 */
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
