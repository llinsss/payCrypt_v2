import { promises as dns } from "dns";
import { isIP } from "net";

const PRIVATE_RANGES = [
  /^127\./,                          // loopback
  /^10\./,                           // RFC-1918
  /^172\.(1[6-9]|2\d|3[01])\./,    // RFC-1918
  /^192\.168\./,                    // RFC-1918
  /^169\.254\./,                    // link-local (AWS metadata: 169.254.169.254)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGNAT RFC-6598
  /^0\./,                            // "this" network
  /^255\.255\.255\.255$/,          // limited broadcast
  /^::1$/,                            // IPv6 loopback
  /^fc:/i,                            // IPv6 ULA
  /^fd:/i,                            // IPv6 ULA
  /^fe80:/i,                          // IPv6 link-local
  /^f[cd][0-9a-f]*:/i,                // IPv6 ULA shorthand
  /^::ffff:127\./i,                  // IPv4-mapped loopback
];

function isPrivateIp(ip) {
  if (!ip) return false;
  const normalized = ip.trim().toLowerCase();
  return PRIVATE_RANGES.some((re) => re.test(normalized));
}

/**
 * Validates a webhook URL for SSRF safety.
 * Throws an Error with a descriptive message if the URL is unsafe.
 */
export async function validateWebhookUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new Error("Invalid webhook URL.");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid webhook URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Webhook URL must not contain credentials.");
  }

  const hostname = parsed.hostname;

  if (!hostname || hostname.length === 0) {
    throw new Error("Webhook URL must contain a hostname.");
  }

  // Block localhost variants
  const normalizedHost = hostname.toLowerCase();
  if (
    normalizedHost === "localhost" ||
    normalizedHost.endsWith(".localhost") ||
    normalizedHost.endsWith(".local") ||
    normalizedHost.endsWith(".internal")
  ) {
    throw new Error("Webhook URL must not target internal hostnames.");
  }

  // Block IP-based hostnames that are private/reserved
  if (isIP(normalizedHost)) {
    if (isPrivateIp(normalizedHost)) {
      throw new Error("Webhook URL must not target a private or reserved IP address.");
    }
    return; // public IP — allow
  }

  // Resolve DNS and check every returned address
  let addresses = [];
  try {
    const [ipv4, ipv6] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname),
    ]);

    if (ipv4.status === "fulfilled") addresses = addresses.concat(ipv4.value);
    if (ipv6.status === "fulfilled") addresses = addresses.concat(ipv6.value);
  } catch {
    // ignore; we check results afterwards
  }

  if (addresses.length === 0) {
    throw new Error("Webhook URL hostname could not be resolved.");
  }

  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error("Webhook URL resolves to a private or reserved IP address.");
    }
  }
}
