import PaystackService from "../../services/PaystackService.js";
import OffRampService from "../../services/OffRampService.js";

export const handlePaystackWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const body = req.body;

    if (!PaystackService.verifyWebhookSignature(signature, body)) {
      console.warn('Paystack Webhook: Invalid signature');
      return res.status(400).send('Invalid signature');
    }

    const event = body.event;
    const data = body.data;

    console.log(`Paystack Webhook Received: ${event}`);

    if (event === 'transfer.success') {
      await OffRampService.handleWebhook('paystack', data.reference, 'success', data);
    } else if (event === 'transfer.failed' || event === 'transfer.reversed') {
      await OffRampService.handleWebhook('paystack', data.reference, 'failed', data);
    }

    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Paystack Webhook Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
};
