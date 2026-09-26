/**
 * Customers ordering through the public storefront (Public Menu URL, QR,
 * Iframe) need at least 2 days' notice: today and tomorrow can't be picked
 * (AJ, 2026-09-27). The kitchen team is not held to this — the admin Create
 * Order form allows today and tomorrow, and neither side allows a past date.
 * Pure (no "server-only") so the public form and the server share one rule.
 */
export const PUBLIC_MIN_LEAD_DAYS = 2;

/** The earliest "YYYY-MM-DD" a customer may choose, from the caller's own calendar day. */
export function earliestPublicEventDate(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + PUBLIC_MIN_LEAD_DAYS);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
