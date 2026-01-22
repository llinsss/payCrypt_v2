import express from 'express';
import TagController from '../controllers/TagController.js';
// Add middleware if needed for protected routes, e.g. authenticateToken

const router = express.Router();

// Public route to resolve tag? Or protected?
// Requirements: "Implement tag reservation system".
// Usually creation requires auth, resolution is public.
// I'll make resolve public, create/transfer potentially protected, but for "Core Resolution System" I will leave them open or add TODOs for auth if not explicitly asked to integrate with existing auth.
// "Prevent duplicate tag registration" implies anyone can register if unique.

router.post('/', TagController.create);
router.get('/:tag', TagController.resolve);
router.put('/:tag/transfer', TagController.transfer);

export default router;
