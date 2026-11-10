import type { Pool } from "pg";

// Trusted devices (AJ, 2026-11-10). The provider's two-factor plugin stores the trust itself as a "verification" row (identifier "trust-device-...", value = the
// user id) and a signed cookie in the browser. A trusted device skips the two-step code until the person removes it or changes their password: the plugin is
// given the longest lifetime a browser cookie may safely have (the limit is 400 days), 399 days (TRUST_MAX_AGE_SECONDS), and every sign-in on the device refreshes it, so in practice a device used at least once a year stays trusted. This module lists and removes them, for the caller's own user id only.
export const TRUST_MAX_AGE_SECONDS = 399 * 24 * 60 * 60;
const PREFIX = "trust-device-%";

export type TrustedDevice = { id: string; label: string; lastUsed: string };

export async function listTrustedDevices(pool: Pool, userId: string, now: Date = new Date()): Promise<TrustedDevice[]> {
  await pool.query(`delete from "trustedDeviceLabel" where "userId" = $1 and "identifier" not in (select "identifier" from "verification" where "value" = $1)`, [userId]);
  const { rows } = await pool.query(
    `select v."identifier", v."createdAt", l."label" from "verification" v
       left join "trustedDeviceLabel" l on l."identifier" = v."identifier"
      where v."identifier" like $2 and v."value" = $1 and v."expiresAt" > $3
      order by v."createdAt" desc`,
    [userId, PREFIX, now],
  );
  return rows.map((r) => ({ id: r.identifier as string, label: (r.label as string | null) ?? "A trusted device", lastUsed: new Date(r.createdAt as string).toISOString() }));
}

/** Removes one of the caller's own trusted devices. Anything else (another person's, unknown) is "not found". */
export async function removeTrustedDevice(pool: Pool, userId: string, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`delete from "verification" where "identifier" = $1 and "value" = $2 and "identifier" like $3`, [id, userId, PREFIX]);
  await pool.query(`delete from "trustedDeviceLabel" where "identifier" = $1 and "userId" = $2`, [id, userId]);
  return (rowCount ?? 0) > 0;
}

/** Removes every trusted device of the person (password change or reset, two-step switched off). Returns how many were removed. */
export async function removeAllTrustedDevices(pool: Pool, userId: string): Promise<number> {
  const { rowCount } = await pool.query(`delete from "verification" where "value" = $1 and "identifier" like $2`, [userId, PREFIX]);
  await pool.query(`delete from "trustedDeviceLabel" where "userId" = $1`, [userId]);
  return rowCount ?? 0;
}

/** Remembers a plain label for a new trust row (called from the provider's database hook). Never throws into the sign-in. */
export async function labelTrustedDevice(pool: Pool, identifier: string, userId: string, label: string): Promise<void> {
  try {
    await pool.query(`insert into "trustedDeviceLabel" ("identifier", "userId", "label") values ($1, $2, $3) on conflict do nothing`, [identifier, userId, label]);
  } catch {
    /* a missing label only shows the generic name */
  }
}
