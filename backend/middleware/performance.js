import logger from '../utils/logger.js';

export const performanceMonitor = (req, res, next) => {
    const start = process.hrtime();

    const originalEnd = res.end;
    res.end = function (...args) {
        if (!res.headersSent) {
            const diff = process.hrtime(start);
            const timeInMs = (diff[0] * 1e9 + diff[1]) / 1e6;
            res.setHeader('X-Response-Time', `${timeInMs.toFixed(3)}ms`);
        }
        return originalEnd.apply(this, args);
    };

    res.on('finish', () => {
        const diff = process.hrtime(start);
        const timeInMs = (diff[0] * 1e9 + diff[1]) / 1e6;
        const formattedTime = timeInMs.toFixed(3);

        const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${formattedTime}ms`;

        if (res.statusCode >= 500) {
            logger.error(message, {
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                duration: timeInMs,
                ip: req.ip,
            });
        } else if (res.statusCode >= 400) {
            logger.warn(message, {
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                duration: timeInMs,
                ip: req.ip,
            });
        } else {
            logger.info(message, {
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                duration: timeInMs,
                ip: req.ip,
            });
        }
    });

    next();
};
