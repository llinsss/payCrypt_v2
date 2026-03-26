const express = require('express');
const router = express.Router();
const { getMetrics, getTransactionStatus, getPendingTransactions, trackTransaction } = require('../controllers/monitoringController');

router.get('/metrics', getMetrics);
router.post('/track', trackTransaction);
router.get('/:chain/pending', getPendingTransactions);
router.get('/:chain/tx/:txHash', getTransactionStatus);

module.exports = router;
