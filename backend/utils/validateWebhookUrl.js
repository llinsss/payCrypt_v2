import { promises as dns } from "dns";
import { isIP } from "net";

const PRIVATE_RANGES = [
  /^127\./,                          // loopback
  /^10\./,                           // RFC-1918
  /^172\.(1[6-9]|2\d|3[01])\./,     // RFC-1918
  /^192\.168\./,                     // RFC-1918
  /^169\.254\./,                     // link-local (AWS metadata: 169.254.169.254)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGNAT RFC-6598
  /^0\./,                            // "this" network
  /^::1$/,                           // IPv6 loopback
  /^fc/i,                            // IPv6 ULA
  /^fd/i,                            // IPv6 ULA
  /^fe80/i,                          // IPv6 link-local
];

function isPrivateIp(ip) {
  return PRIVATE_RANGES.some((re) => re.test(ip));
}

/**
 * Validates a webhook URL for SSRF safety.
 * Throws an Error with a descriptive message if the URL is unsafe.
 */
export async function validateWebhookUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid webhook URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS.");
  }

  const hostname = parsed.hostname;

  // Block bare IP addresses
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error("Webhook URL must not target a private or reserved IP address.");
    }
    return; // public IP — allow
  }

  // Block localhost variants
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Webhook URL must not target internal hostnames.");
  }

  // Resolve DNS and check every returned address
  let addresses;
  try {
    addresses = await dns.resolve(hostname);
  } catch {
    throw new Error("Webhook URL hostname could not be resolved.");
  }

  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error("Webhook URL resolves to a private or reserved IP address.");
    }
  }
}
