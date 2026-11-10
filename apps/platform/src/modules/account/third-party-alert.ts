import type { Pool } from "pg";
import { thirdPartyAccessAlertEmail } from "../auth/email-templates";
import { sendAuthEmail, type AuthEmail } from "../auth/mailer";
import { getPreferences } from "./notification-preferences";

/**
 * "App access" alert (optional, on by default). Built ahead of the feature (AJ, 2026-11-10): apps cannot be connected to an account yet (M3), so nothing calls this today.
 * The connect flow will call it when an app is given access. It respects the person's switch, never throws into the caller, and returns whether a mail was sent.
 */
export async function alertThirdPartyAccess(pool: Pool, userId: string, appName: string, send: (mail: AuthEmail) => Promise<void> = (m) => sendAuthEmail(m)): Promise<boolean> {
  try {
    const name = appName.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80);
    if (!name) return false;
    if (!(await getPreferences(pool, userId)).thirdPartyAlert) return false;
    const user = (await pool.query(`select "email" from "user" where "id" = $1`, [userId])).rows[0] as { email: string } | undefined;
    if (!user) return false;
    await send({ to: user.email, ...thirdPartyAccessAlertEmail(name) });
    return true;
  } catch (error) {
    console.error("app access alert failed", error instanceof Error ? error.message : "unknown");
    return false;
  }
}
