import type { Pool } from "pg";

// Account notification choices (AJ, 2026-11-10). Only these three are optional. Security, ownership and billing notices are mandatory and never listed here,
// and product notices stay with each product. No row means the defaults; a row is written the first time a person changes a choice. Own user id only.
export const PREFERENCE_KEYS = ["newSignInAlert", "thirdPartyAlert", "newsletter"] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];
export type Preferences = Record<PreferenceKey, boolean>;
export const DEFAULT_PREFERENCES: Preferences = { newSignInAlert: true, thirdPartyAlert: true, newsletter: false };

// The newsletter choice lives in "accountProfile"."notifyProductUpdates" (it was the Profile page's "Product updates" switch); the two alerts live in "notificationPreference".
export async function getPreferences(pool: Pool, userId: string): Promise<Preferences> {
  const { rows } = await pool.query(
    `select n."newSignInAlert", n."thirdPartyAlert", p."notifyProductUpdates" as "newsletter" from "user" u
       left join "notificationPreference" n on n."userId" = u."id" left join "accountProfile" p on p."userId" = u."id" where u."id" = $1`,
    [userId],
  );
  const r = rows[0] as { newSignInAlert: boolean | null; thirdPartyAlert: boolean | null; newsletter: boolean | null } | undefined;
  return {
    newSignInAlert: r?.newSignInAlert ?? DEFAULT_PREFERENCES.newSignInAlert,
    thirdPartyAlert: r?.thirdPartyAlert ?? DEFAULT_PREFERENCES.thirdPartyAlert,
    newsletter: r?.newsletter ?? DEFAULT_PREFERENCES.newsletter,
  };
}

/** Changes the named choices only; anything else in the input is ignored and a non-boolean value is refused. */
export async function setPreferences(pool: Pool, userId: string, change: Record<string, unknown>): Promise<Preferences | null> {
  const next = await getPreferences(pool, userId);
  let touched = false;
  for (const key of PREFERENCE_KEYS) {
    if (!(key in change)) continue;
    if (typeof change[key] !== "boolean") return null;
    next[key] = change[key] as boolean;
    touched = true;
  }
  if (!touched) return null;
  await pool.query(
    `insert into "notificationPreference" ("userId", "newSignInAlert", "thirdPartyAlert") values ($1, $2, $3)
     on conflict ("userId") do update set "newSignInAlert" = $2, "thirdPartyAlert" = $3, "updatedAt" = now()`,
    [userId, next.newSignInAlert, next.thirdPartyAlert],
  );
  await pool.query(
    `insert into "accountProfile" ("userId", "notifyProductUpdates") values ($1, $2)
     on conflict ("userId") do update set "notifyProductUpdates" = $2, "updatedAt" = now()`,
    [userId, next.newsletter],
  );
  return next;
}
