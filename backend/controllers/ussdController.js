const UssdService = require('../services/UssdService');
const { successResponse, errorResponse } = require('../utils/response');

exports.handleUssd = async (req, res) => {
  try {
    const { sessionId, serviceCode, phoneNumber, text } = req.body;

    if (!sessionId || !phoneNumber) {
      return errorResponse(res, 'Missing required fields', 400);
    }

    const result = await UssdService.handleUssdRequest(sessionId, phoneNumber, text || '');

    res.set('Content-Type', 'text/plain');
    return res.send(result.message);
  } catch (error) {
    console.error('USSD Error:', error);
    res.set('Content-Type', 'text/plain');
    return res.send('END Service temporarily unavailable. Please try again.');
  }
};

exports.getUssdStats = async (req, res) => {
  try {
    const stats = await db('transactions')
      .where({ channel: 'ussd' })
      .select(
        db.raw('COUNT(*) as total_transactions'),
        db.raw('SUM(amount) as total_volume'),
        db.raw('COUNT(DISTINCT user_id) as unique_users')
      )
      .first();

    return successResponse(res, stats);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};
