import { prisma } from "@/lib/db";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { writeAudit } from "@/modules/audit/write-audit";
import { confirmPassword } from "@/modules/account/confirm-password";
import { getProfile } from "@/modules/account/profile";
import { confirmRecovery, getRecovery, removeRecovery, startRecovery } from "@/modules/account/recovery-email";
import { accountOrigin } from "@/modules/auth/config";
import { identityPool } from "@/modules/auth/identity-db";
import { idp } from "@/modules/auth/idp";
import { sendAuthEmail } from "@/modules/auth/mailer";
import { OTP } from "@/modules/auth/config";
import { otherCodeEmail, recoveryEmailChangedEmail } from "@/modules/auth/email-templates";

// Recovery email for password reset. GET: the verified recovery address and any change waiting for its code. POST {action}: "start" {password, email} mails a
// code to the new address; "confirm" {code} verifies it and switches it on; "remove" {password}. Account host, same-origin JSON only. The person's main
// email gets a notice for every change. The recovery address is used only to reset a password.
const NO_STORE = { "cache-control": "no-store" };
const PASSWORD_STATUS = { wrong_password: 403, no_password: 409, too_many_attempts: 429 } as const;
const START_STATUS = { invalid: 422, same_as_main: 422, too_soon: 429 } as const;
const CONFIRM_STATUS = { wrong_code: 422, expired: 422, too_many_tries: 429, nothing_pending: 409 } as const;

export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  try {
    return Response.json({ status: "ok", ...(await getRecovery(identityPool(), ref.sub)) }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { action?: unknown; password?: unknown; email?: unknown; code?: unknown } | null;
  const action = body?.action;
  if (action !== "start" && action !== "confirm" && action !== "remove") return Response.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  const secret = process.env.AUTH_SECRET;
  if (!secret) return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  try {
    const pool = identityPool();
    const profile = await getProfile(pool, ref.sub);
    if (!profile) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
    if (action !== "confirm") {
      const checked = await confirmPassword(pool, (await idp().$context).password, ref.sub, body?.password);
      if (checked !== "ok") return Response.json({ status: checked }, { status: PASSWORD_STATUS[checked], headers: NO_STORE });
    }
    const before = (await getRecovery(pool, ref.sub)).email;

    if (action === "start") {
      const started = await startRecovery(pool, secret, ref.sub, profile.email, body?.email);
      if (!started.ok) return Response.json({ status: started.reason }, { status: START_STATUS[started.reason], headers: NO_STORE });
      try {
        await sendAuthEmail({ to: started.to, ...otherCodeEmail("recovery-email", started.code, OTP.expiresInSeconds / 60) });
      } catch {
        return Response.json({ status: "send_failed" }, { status: 502, headers: NO_STORE });
      }
      return Response.json({ status: "ok" }, { headers: NO_STORE });
    }
    if (action === "confirm") {
      const result = await confirmRecovery(pool, secret, ref.sub, body?.code);
      if (result !== "ok") return Response.json({ status: result }, { status: CONFIRM_STATUS[result], headers: NO_STORE });
      await record(ref.session.userId, profile.email, before ? "account.recovery_email_changed" : "account.recovery_email_added");
      return Response.json({ status: "ok" }, { headers: NO_STORE });
    }
    const removed = await removeRecovery(pool, ref.sub);
    if (removed) await record(ref.session.userId, profile.email, "account.recovery_email_removed");
    return Response.json({ status: "ok" }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

const NOTICE = {
  "account.recovery_email_added": "A recovery email was added to your Platterly account. It can be used to reset your password.",
  "account.recovery_email_changed": "The recovery email on your Platterly account was changed.",
  "account.recovery_email_removed": "The recovery email on your Platterly account was removed.",
} as const;

/** Audit row (no address in it) and a notice to the MAIN email. A failure of either never undoes the change; it is logged without any address. */
async function record(platformUserId: string, mainEmail: string, action: keyof typeof NOTICE) {
  try {
    await prisma.$transaction((tx) => writeAudit(tx, { action, outcome: "done", initiator: { kind: "user", ref: platformUserId }, executor: { kind: "system", ref: "account" }, subject: { type: "user", id: platformUserId } }));
  } catch (error) {
    console.error("recovery email audit write failed", error instanceof Error ? error.message : "unknown");
  }
  try {
    await sendAuthEmail({ to: mainEmail, ...recoveryEmailChangedEmail(NOTICE[action]) });
  } catch (error) {
    console.error("recovery email notice failed", error instanceof Error ? error.message : "unknown");
  }
}
