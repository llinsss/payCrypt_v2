import db from '../config/database.js';
import fs from 'fs';
import logger from '../utils/logger.js';

const CLEANUP_MAX_RETRIES = 3;
const CLEANUP_INITIAL_DELAY = 1000; // 1 second
const CLEANUP_FAILURE_THRESHOLD = 5; // Alert after 5 consecutive failures

// Metrics for cleanup operations
const metrics = {
    deleted: 0,
    missing: 0,
    failed: 0,
    lastFailureExportId: null,
    consecutiveFailures: 0
};

/**
 * Get safe error code without exposing filesystem details
 */
function getSafeErrorCode(error) {
    if (error.code === 'ENOENT') return 'FILE_NOT_FOUND';
    if (error.code === 'EACCES') return 'PERMISSION_DENIED';
    if (error.code === 'EBUSY') return 'FILE_BUSY';
    return 'CLEANUP_ERROR';
}

/**
 * Attempt file deletion with retry logic
 */
async function deleteFileWithRetry(filePath, exportId, maxRetries = CLEANUP_MAX_RETRIES) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                // Already missing is a success state
                return { success: true, outcome: 'missing' };
            }

            // Attempt deletion
            fs.unlinkSync(filePath);
            return { success: true, outcome: 'deleted' };
        } catch (error) {
            lastError = error;
            const errorCode = getSafeErrorCode(error);

            // Transient errors (EBUSY) can be retried
            const isTransient = error.code === 'EBUSY';

            if (attempt < maxRetries && isTransient) {
                // Exponential backoff: delay = initial * 2^attempt
                const delay = CLEANUP_INITIAL_DELAY * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            // Log failure without path or sensitive data
            logger.warn('[ExportCleanupService] File deletion failed', {
                exportId,
                errorCode,
                attempt: attempt + 1,
                maxRetries: maxRetries + 1
            });

            if (attempt === maxRetries) {
                return { success: false, outcome: 'failed', errorCode };
            }
        }
    }

    return { success: false, outcome: 'failed', errorCode: getSafeErrorCode(lastError) };
}

export default {
    /**
     * Clean up a single expired export
     * Attempts to delete file, only deletes DB record after file is confirmed gone or missing
     */
    async cleanupSingleExport(exportRecord) {
        const { id: exportId, file_path: filePath } = exportRecord;

        // Step 1: Attempt file deletion with retries
        const deleteResult = await deleteFileWithRetry(filePath, exportId);

        // Step 2: Update metrics
        if (deleteResult.outcome === 'deleted') {
            metrics.deleted++;
            metrics.consecutiveFailures = 0;
        } else if (deleteResult.outcome === 'missing') {
            metrics.missing++;
            metrics.consecutiveFailures = 0;
        } else {
            metrics.failed++;
            metrics.consecutiveFailures++;
            metrics.lastFailureExportId = exportId;
        }

        // Step 3: Check alert threshold
        if (metrics.consecutiveFailures >= CLEANUP_FAILURE_THRESHOLD) {
            logger.error('[ExportCleanupService] Cleanup failure threshold reached', {
                consecutiveFailures: metrics.consecutiveFailures,
                threshold: CLEANUP_FAILURE_THRESHOLD,
                lastFailedExportId: exportId
            });
        }

        // Step 4: Only delete DB record if file is confirmed removed or missing
        if (deleteResult.success) {
            try {
                await db('export_exports').where({ id: exportId }).delete();
            } catch (dbError) {
                logger.error('[ExportCleanupService] Failed to delete DB record', {
                    exportId,
                    error: dbError.message
                });
                throw dbError;
            }
        }

        return deleteResult;
    },

    /**
     * Clean up all expired exports
     * Returns summary of cleanup operations
     */
    async cleanupExpiredExports() {
        try {
            const expired = await db('export_exports')
                .where('expires_at', '<', new Date())
                .select('id', 'file_path');

            const results = {
                total: expired.length,
                successful: 0,
                deleted: 0,
                missing: 0,
                failed: 0,
                errors: []
            };

            for (const row of expired) {
                try {
                    const result = await this.cleanupSingleExport(row);
                    if (result.success) {
                        results.successful++;
                        if (result.outcome === 'deleted') results.deleted++;
                        else if (result.outcome === 'missing') results.missing++;
                    } else {
                        results.failed++;
                        results.errors.push({
                            exportId: row.id,
                            errorCode: result.errorCode
                        });
                    }
                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        exportId: row.id,
                        errorCode: 'DB_ERROR'
                    });
                }
            }

            logger.info('[ExportCleanupService] Cleanup complete', results);
            return results;
        } catch (error) {
            logger.error('[ExportCleanupService] Cleanup job failed', {
                error: error.message
            });
            throw error;
        }
    },

    /**
     * Get current cleanup metrics
     */
    getMetrics() {
        return { ...metrics };
    },

    /**
     * Reset metrics (for testing)
     */
    resetMetrics() {
        metrics.deleted = 0;
        metrics.missing = 0;
        metrics.failed = 0;
        metrics.lastFailureExportId = null;
        metrics.consecutiveFailures = 0;
    }
};
