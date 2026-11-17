import type { Pool } from "pg";
import { deleteLogo, logoDir, logoKeyFromUrl } from "./business-logo";

/** After a billing profile is saved with a logo this Platform hosts: the upload is in use, so the sweep leaves it. A link to anywhere else, or none, does nothing. */
export async function markLogoSaved(pool: Pool, url: string | null | undefined): Promise<void> {
  const key = logoKeyFromUrl(url);
  if (key) await pool.query(`update "accountLogoUpload" set "savedAt" = coalesce("savedAt", now()) where "key" = $1`, [key]);
}

/**
 * Deletes logo files that were uploaded in the Account and never saved to a profile (the person closed the form, or picked another file), once they are
 * older than `olderThanDays`. The file goes first and the row after, so a failed delete is tried again on the next pass. Returns how many were removed.
 */
export async function sweepAbandonedLogos(pool: Pool, opts: { olderThanDays?: number; limit?: number; dir?: string } = {}): Promise<number> {
  const { rows } = await pool.query(`select "key" from "accountLogoUpload" where "savedAt" is null and "createdAt" < now() - make_interval(days => $1) order by "createdAt" limit $2`, [opts.olderThanDays ?? 7, opts.limit ?? 200]);
  let removed = 0;
  for (const { key } of rows as { key: string }[]) {
    await deleteLogo(key, opts.dir ?? logoDir());
    await pool.query(`delete from "accountLogoUpload" where "key" = $1 and "savedAt" is null`, [key]);
    removed += 1;
  }
  return removed;
}
