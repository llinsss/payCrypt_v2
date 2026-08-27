import * as Sentry from "@sentry/node";
import MonnifyService from "../../services/MonnifyService.js";
import OffRampService from "../../services/OffRampService.js";

/**
 * Monnify webhook handler for bank withdrawal (off-ramp) transfer events.
 *
 * Security (issue #382): Monnify's webhook is public and unauthenticated
 * beyond its HMAC signature, so every event MUST be verified before it is
 * trusted. A withdrawal is only ever marked `completed` here after signature
 * verification succeeds AND the event type is a successful disbursement —
 * no other code path is allowed to set that status for Monnify withdrawals.
 */
export const handleMonnifyWebhook = async (req, res) => {
  try {
    const signature = req.headers['monnify-signature'];
    // Verify against the exact bytes Monnify signed. `req.rawBody` is
    // captured for every JSON route by the `verify` hook in
    // middleware/payloadLimits.js; fall back to re-serializing the parsed
    // body only if the raw buffer is unavailable (e.g. in older test setups).
    const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});

    if (!MonnifyService.verifyWebhookSignature(signature, rawBody)) {
      const ip =
        req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress;
      console.warn('Monnify Webhook: Invalid signature');
      Sentry.captureMessage('Monnify webhook signature verification failed', {
        level: 'warning',
        extra: {
          ip,
          signature,
          payload: req.body,
        },
      });
      return res.status(400).send('Invalid signature');
    }

    const body = req.body || {};
    const eventType = body.eventType;
    const eventData = body.eventData || {};

    console.log(`Monnify Webhook Received: ${eventType}`);

    // Monnify's disbursement/transfer webhook uses `DISBURSEMENT_SUCCESSFUL`;
    // some Monnify event payloads use a bare `SUCCESSFUL` status instead.
    // Only these verified, successful event types are allowed to complete a
    // withdrawal.
    if (eventType === 'DISBURSEMENT_SUCCESSFUL' || eventType === 'SUCCESSFUL') {
      await OffRampService.handleWebhook('monnify', eventData.reference, 'success', eventData);
    } else if (
      eventType === 'DISBURSEMENT_FAILED' ||
      eventType === 'DISBURSEMENT_REVERSED' ||
      eventType === 'FAILED'
    ) {
      await OffRampService.handleWebhook('monnify', eventData.reference, 'failed', eventData);
    } else {
      console.warn(`Monnify Webhook: Unhandled event type "${eventType}", ignoring`);
    }

    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Monnify Webhook Error:', error.message);
    Sentry.captureException(error);
    res.status(500).send('Internal Server Error');
  }
};
