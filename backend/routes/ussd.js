const express = require('express');
const router = express.Router();
const ussdController = require('../controllers/ussdController');
const { authenticate } = require('../middleware/auth');

// Public endpoint for USSD gateway
router.post('/callback', ussdController.handleUssd);

// Admin endpoint for stats
router.get('/stats', authenticate, ussdController.getUssdStats);

module.exports = router;
