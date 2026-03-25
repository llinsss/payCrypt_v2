import IdempotencyService from '../services/IdempotencyService.js';

/**
 * Middleware to enforce idempotency for critical transactions
 */
export const idempotency = async (req, res, next) => {
    const idempotencyKey = req.headers['x-idempotency-key'] || req.headers['idempotency-key'];

    if (!idempotencyKey) {
        return res.status(400).json({
            error: 'Idempotency key required',
            message: 'Critical transactions require an X-Idempotency-Key header.'
        });
    }

    try {
        const record = await IdempotencyService.getRecord(idempotencyKey);

        if (record) {
            if (record.status === 'in-progress') {
                return res.status(409).json({
                    error: 'Conflict',
                    message: 'A request with this idempotency key is already in progress.',
                    retry_after: 5
                });
            }

            if (record.status === 'completed') {
                // Return cached response
                return res.status(200).json(record.response);
            }
        }

        // Try to acquire lock
        const locked = await IdempotencyService.setLock(idempotencyKey);
        if (!locked) {
            return res.status(409).json({
                error: 'Conflict',
                message: 'A request with this idempotency key is already in progress.'
            });
        }

        // Override res.json to cache the response automatically
        const originalJson = res.json;
        res.json = function (data) {
            // Only cache successful or client error responses (don't cache 500s maybe?)
            // Actually, standard idempotency caches the response regardless if it's "finished"
            // But usually we only want to cache 2xx and 4xx.
            if (res.statusCode < 500) {
                IdempotencyService.saveResponse(idempotencyKey, data).catch(err => {
                    console.error('Failed to cache idempotent response:', err);
                });
            } else {
                // If it's a 500, we probably want to allow retries, so delete the lock
                IdempotencyService.deleteRecord(idempotencyKey).catch(err => {
                    console.error('Failed to release idempotency lock:', err);
                });
            }

            return originalJson.call(this, data);
        };

        next();
    } catch (error) {
        console.error('Idempotency middleware error:', error);
        next(); // Fallback: allow request if idempotency check fails?
        // Or return 500? In financial systems, better to fail loud.
        // For now, let's just proceed to not block traffic if Redis is down (Service degradation).
    }
};
