import { createHmac, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";

// One-click unsubscribe (AJ, 2026-11-10). The link in every newsletter carries the person's id and a signature made with the server secret, so it needs no sign-in and
// cannot be made up for someone else. The link only OPENS a confirm page; the change itself is a POST, so a mail scanner that prefetches links cannot unsubscribe anyone.
const sign = (secret: string, userId: string) => createHmac("sha256", secret).update(`newsletter-unsubscribe:${userId}`).digest("base64url");

export const unsubscribeToken = (secret: string, userId: string) => sign(secret, userId);

export function verifyUnsubscribe(secret: string, userId: string, token: string): boolean {
  if (!secret || !userId || !token) return false;
  const a = Buffer.from(sign(secret, userId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unsubscribeUrl(accountOrigin: string, secret: string, userId: string): string {
  return `${accountOrigin}/unsubscribe?u=${encodeURIComponent(userId)}&t=${sign(secret, userId)}`;
}

/** Switches the newsletter off for this person (the same choice the Notifications page shows). Returns whether the person exists. */
export async function applyUnsubscribe(pool: Pick<Pool, "query">, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query('select 1 from "user" where "id" = $1', [userId]);
  if (!rowCount) return false;
  await pool.query(
    `insert into "accountProfile" ("userId", "notifyProductUpdates") values ($1, false)
     on conflict ("userId") do update set "notifyProductUpdates" = false, "updatedAt" = now()`,
    [userId],
  );
  return true;
}
