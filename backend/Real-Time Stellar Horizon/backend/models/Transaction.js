const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
  amount: { type: Number, required: true },
  asset: { type: String, default: 'XLM' },
  sender: { type: String },
  memo: { type: String },
  stellarTxHash: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', transactionSchema);
