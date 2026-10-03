import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalUrl } from "@/lib/seo/canonical";

/**
 * The unsubscribe link in customer emails (AJ, 2026-10-04). Stateless: the link is the customer id plus an HMAC
 * of it, so nothing is stored per email and a link can't be guessed or edited to unsubscribe somebody else.
 * It only opts out of promotional messages; the emails a customer asked for (quotation, invoice, receipt,
 * reminders...) keep coming.
 */
const secret = () => process.env.UNSUBSCRIBE_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "dev-unsubscribe-secret";

function sign(customerId: string): string {
  return createHmac("sha256", secret()).update(`unsubscribe:${customerId}`).digest("base64url").slice(0, 22);
}

export function unsubscribeUrl(customerId: string): string {
  return canonicalUrl(`/unsubscribe/${customerId}.${sign(customerId)}`);
}

/** The customer id inside a valid token, or null for anything forged, edited or malformed. */
export function customerIdFromUnsubscribeToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const id = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const wanted = Buffer.from(sign(id));
  return given.length === wanted.length && timingSafeEqual(given, wanted) ? id : null;
}
