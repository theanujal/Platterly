import type { Pool } from "pg";
import { confirmPassword } from "./confirm-password";
import type { PasswordHasher } from "./password";
import { providerSessionHeaders, twoFactorStatus } from "./two-factor";
import type { Idp } from "../auth/idp";

// The check for an action that moves ownership of a business (AJ: "central password and two-step"): the person's password again, and, when two-step verification
// is on, an authenticator code or a backup code. Same rules and limits as the email change. `http` is the status the route answers with.
export type Confirmed = { ok: true } | { ok: false; status: string; http: number };
const PASSWORD_STATUS = { wrong_password: 403, no_password: 409, too_many_attempts: 429 } as const;

export async function confirmSensitive(pool: Pool, provider: Idp, hasher: PasswordHasher, who: { sid: string; sub: string }, body: { password?: unknown; totp?: unknown; backupCode?: unknown } | null): Promise<Confirmed> {
  const checked = await confirmPassword(pool, hasher, who.sub, body?.password);
  if (checked !== "ok") return { ok: false, status: checked, http: PASSWORD_STATUS[checked] };
  if (!(await twoFactorStatus(pool, who.sub)).enabled) return { ok: true };
  const totp = typeof body?.totp === "string" ? body.totp.trim() : "";
  const backupCode = typeof body?.backupCode === "string" ? body.backupCode.trim() : "";
  if (!/^\d{6}$/.test(totp) && !(backupCode.length > 0 && backupCode.length <= 40)) return { ok: false, status: "two_factor_required", http: 403 };
  const headers = await providerSessionHeaders(provider, pool, who.sid, who.sub);
  if (!headers) return { ok: false, status: "unauthenticated", http: 401 };
  if (backupCode && !/^\d{6}$/.test(totp)) {
    const good = await provider.api.verifyBackupCode({ body: { code: backupCode, disableSession: true }, headers }).then(() => true, () => false);
    return good ? { ok: true } : { ok: false, status: "wrong_backup_code", http: 403 };
  }
  const good = await provider.api.verifyTOTP({ body: { code: totp }, headers }).then(() => true, () => false);
  return good ? { ok: true } : { ok: false, status: "wrong_two_factor", http: 403 };
}
