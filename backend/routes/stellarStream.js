import express from 'express';
import { getStreamMetrics, controlStream } from '../utils/stellarStreamHealth.js';
import { getStreamService } from '../services/StellarStreamService.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.get('/status', async (req, res) => {
    try {
        const metrics = await getStreamMetrics();
        res.json({
            success: true,
            data: metrics,
        });
    } catch (error) {
        logger.error('Error getting stream status:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

router.get('/metrics', async (req, res) => {
    try {
        const metrics = await getStreamMetrics();
        res.json({
            success: true,
            data: metrics,
        });
    } catch (error) {
        logger.error('Error getting stream metrics:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

router.post('/control', async (req, res) => {
    const { action } = req.body;

    if (!action) {
        return res.status(400).json({
            success: false,
            error: 'Action is required',
        });
    }

    const validActions = ['start', 'stop', 'restart', 'reload'];
    if (!validActions.includes(action)) {
        return res.status(400).json({
            success: false,
            error: `Invalid action. Must be one of: ${validActions.join(', ')}`,
        });
    }

    try {
        const result = await controlStream(action);
        res.json({
            success: result.success,
            message: result.message,
            action,
        });
    } catch (error) {
        logger.error(`Error controlling stream (${action}):`, error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

router.get('/addresses', async (req, res) => {
    try {
        const streamService = getStreamService();
        const addresses = Array.from(streamService.subscribedAddresses.entries()).map(
            ([address, info]) => ({
                address,
                userId: info.userId,
                tag: info.tag,
            })
        );

        res.json({
            success: true,
            count: addresses.length,
            addresses,
        });
    } catch (error) {
        logger.error('Error getting addresses:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

router.post('/addresses/register', async (req, res) => {
    const { stellarAddress, userId, tag } = req.body;

    if (!stellarAddress || !userId) {
        return res.status(400).json({
            success: false,
            error: 'stellarAddress and userId are required',
        });
    }

    try {
        const streamService = getStreamService();
        streamService.registerAddress(stellarAddress, userId, tag);
        
        logger.info(`Registered ${stellarAddress} for user ${userId}`);
        
        res.json({
            success: true,
            message: `Address ${stellarAddress} registered for streaming`,
            address: stellarAddress,
            userId,
            tag,
        });
    } catch (error) {
        logger.error('Error registering address:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

router.delete('/addresses/unregister', async (req, res) => {
    const { stellarAddress } = req.body;

    if (!stellarAddress) {
        return res.status(400).json({
            success: false,
            error: 'stellarAddress is required',
        });
    }

    try {
        const streamService = getStreamService();
        const removed = streamService.unregisterAddress(stellarAddress);
        
        if (removed) {
            logger.info(`Unregistered ${stellarAddress} from streaming`);
            res.json({
                success: true,
                message: `Address ${stellarAddress} unregistered from streaming`,
            });
        } else {
            res.status(404).json({
                success: false,
                error: `Address ${stellarAddress} not found`,
            });
        }
    } catch (error) {
        logger.error('Error unregistering address:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

export default router;