import MonnifyService from "../../services/MonnifyService.js";
import OffRampService from "../../services/OffRampService.js";

export const handleMonnifyWebhook = async (req, res) => {
  try {
    const signature = req.headers['monnify-signature'];
    const body = req.body;

    if (!MonnifyService.verifyWebhookSignature(signature, body)) {
      console.warn('Monnify Webhook: Invalid signature');
      return res.status(400).send('Invalid signature');
    }

    const eventType = body.eventType;
    const eventData = body.eventData;

    console.log(`Monnify Webhook Received: ${eventType}`);

    if (eventType === 'DISBURSEMENT_SUCCESSFUL') {
      await OffRampService.handleWebhook('monnify', eventData.reference, 'success', eventData);
    } else if (eventType === 'DISBURSEMENT_FAILED' || eventType === 'DISBURSEMENT_REVERSED') {
      await OffRampService.handleWebhook('monnify', eventData.reference, 'failed', eventData);
    }

    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Monnify Webhook Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
};
