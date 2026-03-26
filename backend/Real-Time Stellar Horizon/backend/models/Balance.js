const mongoose = require('mongoose');
const redis = require('../config/redis');

const balanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  amount: { type: Number, default: 0 },
  asset: { type: String, default: 'XLM' },
  updatedAt: { type: Date, default: Date.now }
});

balanceSchema.statics.credit = async function (userId, amount) {
  const balance = await this.findOneAndUpdate(
    { userId },
    { $inc: { amount }, updatedAt: new Date() },
    { new: true, upsert: true }
  );

  await redis.publish('balance:updates', JSON.stringify({ userId: userId.toString(), balance: balance.amount }));
  return balance;
};

module.exports = mongoose.model('Balance', balanceSchema);
