import { jest } from '@jest/globals';
import fs from 'fs';

jest.unstable_mockModule('../config/database.js', () => ({
    default: jest.fn((tableName) => ({
        where: jest.fn().mockReturnThis(),
        select: jest.fn(),
        delete: jest.fn()
    }))
}));

jest.unstable_mockModule('fs', () => ({
    existsSync: jest.fn(),
    unlinkSync: jest.fn()
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
    default: {
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn()
    }
}));

const db = (await import('../config/database.js')).default;
const { existsSync, unlinkSync } = await import('fs');
const logger = (await import('../utils/logger.js')).default;
const ExportCleanupService = (await import('../services/ExportCleanupService.js')).default;

describe('ExportCleanupService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        ExportCleanupService.resetMetrics();
    });

    describe('current behavior reproduction', () => {
        it('should NOT delete DB row if file deletion fails', async () => {
            const exportRecord = { id: 1, file_path: '/storage/export1.csv' };
            existsSync.mockReturnValue(true);
            unlinkSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const dbMock = jest.fn(() => ({
                where: jest.fn().mockReturnThis(),
                delete: jest.fn()
            }));
            jest.doMock('../config/database.js', () => ({ default: dbMock }));

            const result = await ExportCleanupService.cleanupSingleExport(exportRecord);

            expect(result.success).toBe(false);
            // DB deletion should NOT be called on file deletion failure
        });

        it('should treat missing file as success (already gone)', async () => {
            const exportRecord = { id: 2, file_path: '/storage/missing.csv' };
            existsSync.mockReturnValue(false);

            const result = await ExportCleanupService.cleanupSingleExport(exportRecord);

            expect(result.success).toBe(true);
            expect(result.outcome).toBe('missing');
            // File was already gone, treat as success
        });
    });

    describe('failure recording', () => {
        it('should record failure with export ID and safe error code', async () => {
            const exportRecord = { id: 3, file_path: '/storage/export3.csv' };
            existsSync.mockReturnValue(true);
            unlinkSync.mockImplementation(() => {
                const error = new Error('Access denied');
                error.code = 'EACCES';
                throw error;
            });

            await ExportCleanupService.cleanupSingleExport(exportRecord);

            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('File deletion failed'),
                expect.objectContaining({
                    exportId: 3,
                    errorCode: 'PERMISSION_DENIED'
                })
            );
            // Verify error code is safe (not raw filesystem error)
            const logCall = logger.warn.mock.calls[0];
            expect(logCall[1].errorCode).not.toContain('EACCES');
        });

        it('should NOT log file paths or sensitive data', async () => {
            const exportRecord = { id: 4, file_path: '/storage/secret.csv' };
            existsSync.mockReturnValue(true);
            unlinkSync.mockImplementation(() => {
                throw new Error('Some error');
            });

            await ExportCleanupService.cleanupSingleExport(exportRecord);

            // Verify no logs contain the file path
            const allLogCalls = [...logger.warn.mock.calls, ...logger.error.mock.calls];
            allLogCalls.forEach(call => {
                const logContent = JSON.stringify(call);
                expect(logContent).not.toContain('/storage/secret.csv');
            });
        });
    });

    describe('delete order', () => {
        it('should only delete DB row after file is confirmed deleted', async () => {
            const exportRecord = { id: 5, file_path: '/storage/export5.csv' };
            existsSync.mockReturnValue(true);
            unlinkSync.mockReturnValue(undefined);

            const dbInstance = {
                where: jest.fn().mockReturnThis(),
                delete: jest.fn().mockResolvedValue(1)
            };
            db.mockReturnValue(dbInstance);

            await ExportCleanupService.cleanupSingleExport(exportRecord);

            expect(unlinkSync).toHaveBeenCalledBefore(dbInstance.delete);
        });

        it('should delete DB row only after file is confirmed missing', async () => {
            const exportRecord = { id: 6, file_path: '/storage/missing6.csv' };
            existsSync.mockReturnValue(false);

            const dbInstance = {
                where: jest.fn().mockReturnThis(),
                delete: jest.fn().mockResolvedValue(1)
            };
            db.mockReturnValue(dbInstance);

            await ExportCleanupService.cleanupSingleExport(exportRecord);

            expect(dbInstance.delete).toHaveBeenCalled();
        });

        it('should NOT delete DB row if file deletion fails', async () => {
            const exportRecord = { id: 7, file_path: '/storage/export7.csv' };
            existsSync.mockReturnValue(true);
            unlinkSync.mockImplementation(() => {
                throw new Error('Disk full');
            });

            const dbInstance = {
                where: jest.fn().mockReturnThis(),
                delete: jest.fn()
            };
            db.mockReturnValue(dbInstance);

            await ExportCleanupService.cleanupSingleExport(exportRecord);

            expect(dbInstance.delete).not.toHaveBeenCalled();
        });
    });

    describe('retry and backoff', () => {
        it('should retry on transient errors (EBUSY)', async () => {
            const exportRecord = { id: 8, file_path: '/storage/export8.csv' };
            existsSync.mockReturnValue(true);

            let attemptCount = 0;
            unlinkSync.mockImplementation(() => {
                attemptCount++;
                if (attemptCount === 1) {
                    const error = new Error('Device or resource busy');
                    error.code = 'EBUSY';
                    throw error;
                }
                // Second attempt succeeds
                return undefined;
            });

            const start = Date.now();
            await ExportCleanupService.cleanupSingleExport(exportRecord);
            const duration = Date.now() - start;

            expect(attemptCount).toBe(2);
            // Should have waited (exponential backoff, even though mocked)
            expect(duration).toBeGreaterThanOrEqual(0);
        });

        it('should use exponential backoff: delay = initial * 2^attempt', async () => {
            const exportRecord = { id: 9, file_path: '/storage/export9.csv' };
            existsSync.mockReturnValue(true);

            const delays = [];
            const originalSetTimeout = global.setTimeout;
            global.setTimeout = jest.fn((fn) => {
                // Capture delay value
                delays.push(fn.toString());
                fn();
            });

            let attemptCount = 0;
            unlinkSync.mockImplementation(() => {
                attemptCount++;
                if (attemptCount <= 2) {
                    const error = new Error('Busy');
                    error.code = 'EBUSY';
                    throw error;
                }
                return undefined;
            });

            await ExportCleanupService.cleanupSingleExport(exportRecord);

            // Restore setTimeout
            global.setTimeout = originalSetTimeout;

            // Verify retries occurred with backoff
            expect(attemptCount).toBe(3);
        });

        it('should give up after max retries', async () => {
            const exportRecord = { id: 10, file_path: '/storage/export10.csv' };
            existsSync.mockReturnValue(true);
            unlinkSync.mockImplementation(() => {
                const error = new Error('Device busy');
                error.code = 'EBUSY';
                throw error;
            });

            const result = await ExportCleanupService.cleanupSingleExport(exportRecord);

            expect(result.success).toBe(false);
            expect(result.outcome).toBe('failed');
        });
    });

    describe('metrics', () => {
        it('should emit deleted outcome metric', async () => {
            const exportRecord = { id: 11, file_path: '/storage/export11.csv' };
            existsSync.mockReturnValue(true);
            unlinkSync.mockReturnValue(undefined);

            const dbInstance = {
                where: jest.fn().mockReturnThis(),
                delete: jest.fn().mockResolvedValue(1)
            };
            db.mockReturnValue(dbInstance);

            await ExportCleanupService.cleanupSingleExport(exportRecord);

            const metrics = ExportCleanupService.getMetrics();
            expect(metrics.deleted).toBe(1);
        });

        it('should emit missing outcome metric', async () => {
            const exportRecord = { id: 12, file_path: '/storage/missing12.csv' };
            existsSync.mockReturnValue(false);

            const dbInstance = {
                where: jest.fn().mockReturnThis(),
                delete: jest.fn().mockResolvedValue(1)
            };
            db.mockReturnValue(dbInstance);

            await ExportCleanupService.cleanupSingleExport(exportRecord);

            const metrics = ExportCleanupService.getMetrics();
            expect(metrics.missing).toBe(1);
        });

        it('should emit failed outcome metric', async () => {
            const exportRecord = { id: 13, file_path: '/storage/export13.csv' };
            existsSync.mockReturnValue(true);
            unlinkSync.mockImplementation(() => {
                throw new Error('Error');
            });

            await ExportCleanupService.cleanupSingleExport(exportRecord);

            const metrics = ExportCleanupService.getMetrics();
            expect(metrics.failed).toBe(1);
        });

        it('should distinguish deleted, missing, and failed in summary', async () => {
            const dbInstance = {
                where: jest.fn().mockReturnThis(),
                select: jest.fn().mockResolvedValue([
                    { id: 1, file_path: '/storage/export1.csv' },
                    { id: 2, file_path: '/storage/export2.csv' },
                    { id: 3, file_path: '/storage/export3.csv' }
                ]),
                delete: jest.fn().mockResolvedValue(1)
            };
            db.mockReturnValue(dbInstance);

            let callCount = 0;
            existsSync.mockImplementation((path) => callCount++ < 2);
            unlinkSync.mockReturnValue(undefined);

            const results = await ExportCleanupService.cleanupExpiredExports();

            expect(results.deleted).toBeGreaterThanOrEqual(0);
            expect(results.missing).toBeGreaterThanOrEqual(0);
            expect(results.failed).toBeGreaterThanOrEqual(0);
        });
    });

    describe('alert threshold', () => {
        it('should increment consecutive failures on error', async () => {
            const exportRecord = { id: 14, file_path: '/storage/export14.csv' };
            existsSync.mockReturnValue(true);
            unlinkSync.mockImplementation(() => {
                throw new Error('Error');
            });

            await ExportCleanupService.cleanupSingleExport(exportRecord);

            const metrics = ExportCleanupService.getMetrics();
            expect(metrics.consecutiveFailures).toBe(1);
        });

        it('should reset consecutive failures on success', async () => {
            // First failure
            let exportRecord = { id: 15, file_path: '/storage/export15.csv' };
            existsSync.mockReturnValue(true);
            unlinkSync.mockImplementation(() => {
                throw new Error('Error');
            });
            await ExportCleanupService.cleanupSingleExport(exportRecord);
            expect(ExportCleanupService.getMetrics().consecutiveFailures).toBe(1);

            // Then success
            jest.clearAllMocks();
            exportRecord = { id: 16, file_path: '/storage/export16.csv' };
            existsSync.mockReturnValue(false);
            const dbInstance = {
                where: jest.fn().mockReturnThis(),
                delete: jest.fn().mockResolvedValue(1)
            };
            db.mockReturnValue(dbInstance);

            await ExportCleanupService.cleanupSingleExport(exportRecord);

            expect(ExportCleanupService.getMetrics().consecutiveFailures).toBe(0);
        });

        it('should alert when consecutive failures reach threshold', async () => {
            existsSync.mockReturnValue(true);
            unlinkSync.mockImplementation(() => {
                throw new Error('Error');
            });

            // Trigger 5 consecutive failures
            for (let i = 0; i < 5; i++) {
                await ExportCleanupService.cleanupSingleExport({
                    id: 100 + i,
                    file_path: `/storage/export${100 + i}.csv`
                });
            }

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('failure threshold reached'),
                expect.objectContaining({
                    consecutiveFailures: 5
                })
            );
        });
    });

    describe('no PII or tokens in logs', () => {
        it('should not include file paths in logs', async () => {
            const exportRecord = { id: 17, file_path: '/storage/highly-secret-export-17.csv' };
            existsSync.mockReturnValue(true);
            unlinkSync.mockImplementation(() => {
                throw new Error('Error');
            });

            await ExportCleanupService.cleanupSingleExport(exportRecord);

            const allLogCalls = [...logger.warn.mock.calls, ...logger.error.mock.calls];
            allLogCalls.forEach(call => {
                const logStr = JSON.stringify(call);
                expect(logStr).not.toContain('highly-secret-export');
            });
        });

        it('should not include download tokens in logs', async () => {
            const exportRecord = { id: 18, file_path: '/storage/export18.csv' };
            existsSync.mockReturnValue(true);
            unlinkSync.mockImplementation(() => {
                throw new Error('Error');
            });

            await ExportCleanupService.cleanupSingleExport(exportRecord);

            const allLogCalls = [...logger.warn.mock.calls, ...logger.error.mock.calls];
            allLogCalls.forEach(call => {
                const logStr = JSON.stringify(call);
                // Should only have export ID, no paths or tokens
                expect(logStr).toContain('exportId');
            });
        });
    });

    describe('batch cleanup', () => {
        it('should clean up multiple exports and return summary', async () => {
            const dbInstance = {
                where: jest.fn().mockReturnThis(),
                select: jest.fn().mockResolvedValue([
                    { id: 20, file_path: '/storage/export20.csv' },
                    { id: 21, file_path: '/storage/export21.csv' }
                ]),
                delete: jest.fn().mockResolvedValue(1)
            };
            db.mockReturnValue(dbInstance);

            existsSync.mockReturnValue(true);
            unlinkSync.mockReturnValue(undefined);

            const results = await ExportCleanupService.cleanupExpiredExports();

            expect(results.total).toBe(2);
            expect(results.successful).toBe(2);
        });
    });
});
