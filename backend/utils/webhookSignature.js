import crypto from "crypto";

/**
 * Enterprise Webhook Signature Utility
 *
 * Verifies that the webhook payload matches the agreed-upon HMAC-SHA256 signature
 * using the shared secret. Prevents tampering and unauthenticated traffic.
 */

const WebhookSignature = {
  /**
   * Generates an HMAC-SHA256 hex signature from the JSON serialized payload.
   *
   * @param {Object} payload The webhook event payload
   * @param {string} secret The shared secret registered to the webhook listener
   * @returns {string} The format 'sha256=HEX_SIGNATURE'
   */
  generateSignature(payload, secret) {
    const digest = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("hex");
    return `sha256=${digest}`;
  },

  /**
   * Timing-attack safe verification of a supplied signature against the generated expectation.
   *
   * @param {Object} payload The exact JSON stringifiable body object
   * @param {string} signature The 'sha256=...' signature from the headers
   * @param {string} secret The shared secret registered to the webhook listener
   * @returns {boolean} Whether the signatures match perfectly
   */
  verifySignature(payload, signature, secret) {
    if (!signature || !signature.startsWith("sha256=")) return false;
    
    const expected = this.generateSignature(payload, secret);
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false; // Timing safe equal throws if lengths differ
    }
  },
};

export default WebhookSignature;
