import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Chunk 25 — a webhook URL is typed in by a kitchen and Platterly's server then calls it, so it must not be a way to
 * reach Platterly's own network (server-side request forgery). Only https, no credentials in the URL, no
 * loopback / private / link-local / metadata addresses, no internal host names. The check runs when the endpoint is
 * saved and again, on the resolved addresses, at every delivery (a name can be pointed at a private address later).
 * `WEBHOOK_ALLOW_PRIVATE_HOSTS=true` lifts the address and https rules for local development only; it is ignored in production.
 */
export class UnsafeWebhookUrlError extends Error {}

const allowPrivate = () => process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS === "true" && process.env.NODE_ENV !== "production";

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

/** Expands an IPv6 address into its eight 16-bit groups (handles `::` and a trailing dotted IPv4). */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().split("%")[0];
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted[1].split(".").map(Number);
    text = text.slice(0, -dotted[1].length) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const [head, tail, extra] = text.split("::");
  if (extra !== undefined) return null;
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((tail === undefined && left.length !== 8) || missing < (tail === undefined ? 0 : 1)) return null;
  const groups = [...left, ...Array(tail === undefined ? 0 : missing).fill("0"), ...right].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

const dotted = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return ipv4Private(ip);
  if (family === 6) {
    const g = ipv6Groups(ip);
    if (!g) return true;
    if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1)) return true; // :: and ::1
    // An IPv4 address wrapped in IPv6 (::ffff:a.b.c.d, ::a.b.c.d, 64:ff9b::a.b.c.d, 6to4 2002:ab:cd::) is as private as the IPv4 inside it.
    if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return ipv4Private(dotted(g[6], g[7]));
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return ipv4Private(dotted(g[6], g[7]));
    if (g[0] === 0x2002) return ipv4Private(dotted(g[1], g[2]));
    return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00 || g[0] === 0x100;
  }
  return true; // not an address at all: never treat as safe
}

const INTERNAL_NAME = /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/i;

/** Throws with a plain-language reason; returns the parsed URL when it is acceptable as typed. */
export function assertWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeWebhookUrlError("Enter a full web address, like https://example.com/hooks/platterly.");
  }
  if (raw.length > 2000) throw new UnsafeWebhookUrlError("That web address is too long.");
  if (url.username || url.password) throw new UnsafeWebhookUrlError("The web address cannot contain a user name or password.");
  if (allowPrivate()) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsafeWebhookUrlError("The web address must start with https://.");
    return url;
  }
  if (url.protocol !== "https:") throw new UnsafeWebhookUrlError("The web address must start with https://.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) ? isPrivateAddress(host) : INTERNAL_NAME.test(host) || !host.includes(".")) throw new UnsafeWebhookUrlError("That address points inside a private network, which Platterly will not call.");
  return url;
}

/** At delivery: every address the name resolves to must be public. Returns normally when it is safe to call. */
export async function assertResolvesPublic(url: URL): Promise<void> {
  if (allowPrivate()) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new UnsafeWebhookUrlError("The address resolves to a private network.");
}
