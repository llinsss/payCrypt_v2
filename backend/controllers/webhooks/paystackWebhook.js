import * as Sentry from "@sentry/node";
import PaystackService from "../../services/PaystackService.js";
import OffRampService from "../../services/OffRampService.js";

export const handlePaystackWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    // Verify against the exact bytes Paystack signed. `req.rawBody` is captured
    // by the express.json `verify` hook in app.js; fall back to re-serializing
    // the parsed body only if the raw buffer is unavailable.
    const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});

    if (!PaystackService.verifyWebhookSignature(signature, rawBody)) {
      const ip =
        req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress;
      console.warn('Paystack Webhook: Invalid signature');
      Sentry.captureMessage('Paystack webhook signature verification failed', {
        level: 'warning',
        extra: {
          ip,
          signature,
          payload: req.body,
        },
      });
      return res.status(401).send('Invalid signature');
    }

    const body = req.body;
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
    Sentry.captureException(error);
    res.status(500).send('Internal Server Error');
  }
};
