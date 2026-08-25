import * as Sentry from "@sentry/node";
import MonnifyService from "../../services/MonnifyService.js";
import OffRampService from "../../services/OffRampService.js";

// Monnify's own "successful disbursement" status/event names, kept as a set
// so a webhook is only ever treated as success when it is unambiguously one
// of these — anything else (including unrecognized event types) is ignored
// rather than assumed safe.
const SUCCESS_EVENTS = new Set(['SUCCESSFUL_DISBURSEMENT', 'DISBURSEMENT_SUCCESSFUL']);
const FAILURE_EVENTS = new Set([
  'FAILED_DISBURSEMENT',
  'DISBURSEMENT_FAILED',
  'REVERSED_DISBURSEMENT',
  'DISBURSEMENT_REVERSED',
]);

export const handleMonnifyWebhook = async (req, res) => {
  try {
    const signature = req.headers['monnify-signature'];
    // Verify against the exact bytes Monnify signed. `req.rawBody` is
    // captured by the express.json `verify` hook in middleware/payloadLimits.js;
    // fall back to re-serializing the parsed body only if the raw buffer is
    // unavailable (e.g. a unit test that constructs `req` directly).
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
    // Some Monnify payloads carry the outcome in `eventData.status` rather
    // than (or in addition to) `eventType`; check both so a differently
    // shaped-but-genuine payload is not silently dropped.
    const eventData = body.eventData || {};
    const status = String(eventData.status || eventType || '').toUpperCase();

    console.log(`Monnify Webhook Received: ${eventType}`);

    if (!eventData.reference) {
      console.warn('Monnify Webhook: missing eventData.reference, ignoring');
      return res.status(200).send('Webhook processed');
    }

    if (SUCCESS_EVENTS.has(eventType) || status === 'SUCCESSFUL') {
      // Only a verified `SUCCESSFUL` event ever marks a withdrawal completed.
      await OffRampService.handleWebhook('monnify', eventData.reference, 'success', eventData);
    } else if (FAILURE_EVENTS.has(eventType) || status === 'FAILED' || status === 'REVERSED') {
      await OffRampService.handleWebhook('monnify', eventData.reference, 'failed', eventData);
    }

    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Monnify Webhook Error:', error.message);
    Sentry.captureException(error);
    res.status(500).send('Internal Server Error');
  }
};
