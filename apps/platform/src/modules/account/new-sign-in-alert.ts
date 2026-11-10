import type { Pool } from "pg";
import { newSignInAlertEmail } from "../auth/email-templates";
import { sendAuthEmail } from "../auth/mailer";
import { deviceLabel } from "./devices";
import { getPreferences } from "./notification-preferences";

/**
 * "New sign-in to account" alert (optional, on by default). Sent when a sign-in comes from a device label (browser and system) that has no earlier successful sign-in in the
 * 90-day history. The first ever sign-in is not alerted (nothing to compare with). Call BEFORE the new sign-in is written to the history. Never throws into the sign-in.
 */
export async function alertIfNewDevice(pool: Pool, userId: string, userAgent: string | null | undefined, now: Date = new Date()): Promise<boolean> {
  try {
    const label = deviceLabel(userAgent);
    const { rows } = await pool.query(`select "userAgent" from "signInEvent" where "userId" = $1 and "outcome" = 'signed_in'`, [userId]);
    if (rows.length === 0 || rows.some((r) => deviceLabel(r.userAgent as string | null) === label)) return false;
    if (!(await getPreferences(pool, userId)).newSignInAlert) return false;
    const user = (await pool.query(`select "email" from "user" where "id" = $1`, [userId])).rows[0] as { email: string } | undefined;
    if (!user) return false;
    await sendAuthEmail({ to: user.email, ...newSignInAlertEmail(label, `${now.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })} IST`) });
    return true;
  } catch (error) {
    console.error("new sign-in alert failed", error instanceof Error ? error.message : "unknown");
    return false;
  }
}
