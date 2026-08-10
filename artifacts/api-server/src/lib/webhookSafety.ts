import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Guards against SSRF: agents register arbitrary webhook URLs which the server
// then POSTs to. Reject anything that isn't public https, both when the URL is
// saved and again at delivery time (DNS may change between the two).

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast + reserved
  );
}

function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    // IPv4-mapped (::ffff:10.0.0.1)
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return false;
  }
  return true; // not an IP at all
}

/**
 * Returns null if the URL is a safe public https endpoint, otherwise a
 * human-readable rejection reason.
 */
export async function checkWebhookUrl(rawUrl: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "Invalid URL";
  }
  if (url.protocol !== "https:") return "Webhook URL must use HTTPS";
  if (url.username || url.password) return "Webhook URL must not contain credentials";

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return "Webhook URL must point to a public host";
  }
  if (isIP(hostname)) {
    return isPrivateAddress(hostname) ? "Webhook URL must point to a public host" : null;
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.length === 0) return "Webhook host does not resolve";
    for (const { address } of addresses) {
      if (isPrivateAddress(address)) return "Webhook URL must point to a public host";
    }
  } catch {
    return "Webhook host does not resolve";
  }
  return null;
}
