import express from 'express';
import TagController from '../controllers/TagController.js';
import rateLimit from 'express-rate-limit';
// Add middleware if needed for protected routes, e.g. authenticateToken

const router = express.Router();

const checkLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // limit each IP to 10 requests per windowMs
    message: { status: 'error', message: 'Too many requests, please try again later.' }
});

// Public route to resolve tag? Or protected?
// Requirements: "Implement tag reservation system".
// Usually creation requires auth, resolution is public.
// I'll make resolve public, create/transfer potentially protected, but for "Core Resolution System" I will leave them open or add TODOs for auth if not explicitly asked to integrate with existing auth.
// "Prevent duplicate tag registration" implies anyone can register if unique.

router.post('/', TagController.create);
router.get('/check/:tag', checkLimiter, TagController.check);
router.get('/:tag', TagController.resolve);
router.put('/:tag/transfer', TagController.transfer);

export default router;
