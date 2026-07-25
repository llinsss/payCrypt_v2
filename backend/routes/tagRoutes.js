import express from 'express';
import TagController from '../controllers/TagController.js';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

const checkLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // limit each IP to 10 requests per windowMs
    message: { status: 'error', message: 'Too many requests, please try again later.' }
});

router.post('/', authenticate, TagController.create);
router.get('/check/:tag', checkLimiter, TagController.check);
router.get('/:tag', TagController.resolve);
router.put('/:tag/transfer', authenticate, TagController.transfer);

export default router;
