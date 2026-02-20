import axios from 'axios';

const WebhookService = {
  async sendStatusChangeWebhook(transaction, oldStatus, newStatus) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) return;

    const payload = {
      event: 'transaction.status_changed',
      transaction_id: transaction.id,
      user_id: transaction.user_id,
      old_status: oldStatus,
      new_status: newStatus,
      amount: transaction.amount,
      usd_value: transaction.usd_value,
      type: transaction.type,
      timestamp: new Date().toISOString()
    };

    await this.sendWithRetry(webhookUrl, payload);
  },

  async sendWithRetry(url, payload, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await axios.post(url, payload, {
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' }
        });
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          console.error('Webhook failed after retries:', error.message);
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
  }
};

export default WebhookService;