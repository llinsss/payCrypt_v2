import express from 'express';
import { getHealth, getReadiness, getLiveness } from '../controllers/healthController.js';

const router = express.Router();

router.get('/', getHealth);
router.get('/ready', getReadiness);
router.get('/live', getLiveness);

export default router;
