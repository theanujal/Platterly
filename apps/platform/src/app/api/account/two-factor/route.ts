import { prisma } from "@/lib/db";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { writeAudit } from "@/modules/audit/write-audit";
import { confirmPassword } from "@/modules/account/confirm-password";
import { getProfile } from "@/modules/account/profile";
import { newSessionIdFrom, providerSessionHeaders, twoFactorStatus } from "@/modules/account/two-factor";
import { sealAccountSession } from "@/modules/auth/account-session";
import { accountOrigin, COOKIES } from "@/modules/auth/config";
import { ACCOUNT_COOKIE_MAX_AGE, cookieOptions } from "@/modules/auth/cookies";
import { identityPool } from "@/modules/auth/identity-db";
import { idp } from "@/modules/auth/idp";
import { sendAuthEmail } from "@/modules/auth/mailer";

// Two-step verification (authenticator app + backup codes) from the Account. GET: is it on. POST {action}: "start" {password} begins set-up and returns the
// authenticator address and backup codes ONCE; "confirm" {code} proves the first code and switches it on; "backup_codes" {password} makes a fresh set;
// "disable" {password} switches it off. The password is asked again for every action that needs it. Account host, same-origin JSON only.
// Switching it on makes the provider replace the person's session, so the Account's own cookie is re-pointed at the new one in the same response.
const NO_STORE = { "cache-control": "no-store" };
const PASSWORD_STATUS = { wrong_password: 403, no_password: 409, too_many_attempts: 429 } as const;

export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  try {
    return Response.json({ status: "ok", ...(await twoFactorStatus(identityPool(), ref.sub)) }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { action?: unknown; password?: unknown; code?: unknown } | null;
  const action = body?.action;
  if (action !== "start" && action !== "confirm" && action !== "backup_codes" && action !== "disable") return Response.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  try {
    const provider = idp();
    const pool = identityPool();
    if (action !== "confirm") {
      const checked = await confirmPassword(pool, (await provider.$context).password, ref.sub, body?.password);
      if (checked !== "ok") return Response.json({ status: checked }, { status: PASSWORD_STATUS[checked], headers: NO_STORE });
    }
    const headers = await providerSessionHeaders(provider, pool, ref.sid, ref.sub);
    if (!headers) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
    const password = String(body?.password ?? "");

    if (action === "start") {
      if ((await twoFactorStatus(pool, ref.sub)).enabled) return Response.json({ status: "already_on" }, { status: 409, headers: NO_STORE });
      const made = await provider.api.enableTwoFactor({ body: { password }, headers });
      if (!("totpURI" in made)) return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
      return Response.json({ status: "ok", totpUri: made.totpURI, backupCodes: made.backupCodes }, { headers: NO_STORE });
    }
    if (action === "confirm") {
      if (typeof body?.code !== "string" || !/^\d{6}$/.test(body.code)) return Response.json({ status: "wrong_code" }, { status: 422, headers: NO_STORE });
      let result;
      try {
        result = await provider.api.verifyTOTP({ body: { code: body.code }, headers, returnHeaders: true });
      } catch {
        return Response.json({ status: "wrong_code" }, { status: 422, headers: NO_STORE });
      }
      const sid = await newSessionIdFrom(provider, pool, result.headers.getSetCookie());
      const response = Response.json({ status: "ok" }, { headers: NO_STORE });
      if (sid) response.headers.append("set-cookie", `${COOKIES.accountSession}=${sealAccountSession(process.env.AUTH_SECRET!, { sid, sub: ref.sub, uid: ref.session.userId })}; Max-Age=${ACCOUNT_COOKIE_MAX_AGE}; Path=/; HttpOnly; SameSite=Lax${cookieOptions(0).secure ? "; Secure" : ""}`);
      await record(ref.session.userId, ref.sub, "account.two_factor_enabled");
      return response;
    }
    if (action === "backup_codes") {
      const made = await provider.api.generateBackupCodes({ body: { password }, headers });
      return Response.json({ status: "ok", backupCodes: made.backupCodes }, { headers: NO_STORE });
    }
    await provider.api.disableTwoFactor({ body: { password }, headers });
    await record(ref.session.userId, ref.sub, "account.two_factor_disabled");
    return Response.json({ status: "ok" }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

/** Audit row and a security notice by email. A failure of either never undoes the change; it is logged without any address. */
async function record(platformUserId: string, providerUserId: string, action: string) {
  try {
    await prisma.$transaction((tx) => writeAudit(tx, { action, outcome: "done", initiator: { kind: "user", ref: platformUserId }, executor: { kind: "system", ref: "account" }, subject: { type: "user", id: platformUserId } }));
  } catch (error) {
    console.error("two-factor audit write failed", error instanceof Error ? error.message : "unknown");
  }
  try {
    const profile = await getProfile(identityPool(), providerUserId);
    const on = action === "account.two_factor_enabled";
    if (profile) await sendAuthEmail({ to: profile.email, subject: `Two-step verification was turned ${on ? "on" : "off"} on your Platterly account`, text: `Two-step verification was just turned ${on ? "on" : "off"} on your Platterly account.\n\nIf this was not you, reset your password now and contact Platterly support.` });
  } catch (error) {
    console.error("two-factor notice failed", error instanceof Error ? error.message : "unknown");
  }
}
