import { prisma } from "@/lib/db";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { writeAudit } from "@/modules/audit/write-audit";
import { confirmPassword } from "@/modules/account/confirm-password";
import { CANCEL_HOURS, claimExpiredNotices, confirmChange, normaliseEmail, pendingChange, startChange } from "@/modules/account/email-change";
import { sendNotYou } from "@/modules/account/email-notices";
import { providerSessionHeaders, twoFactorStatus } from "@/modules/account/two-factor";
import { platformEmailSync, platformEmailTaken } from "@/modules/users/email-sync";
import { emitCurrentPersonProfile } from "@/modules/outbox/person-profile";
import { getProfile } from "@/modules/account/profile";
import { accountOrigin } from "@/modules/auth/config";
import { identityPool } from "@/modules/auth/identity-db";
import { idp } from "@/modules/auth/idp";
import { sendAuthEmail } from "@/modules/auth/mailer";
import { providerSessionEnder } from "@/modules/auth/provider-sessions";
import { endAllSessions } from "@/modules/auth/session-store";

// Change of sign-in email. GET: any change waiting for its code, and whether two-step verification is on. POST {action}: "start" {password, email, totp?} mails a
// code to the NEW address (the authenticator code is required when two-step verification is on); "confirm" {code} checks it, changes the email (identity and the
// Platform's copy together), ends EVERY session including this one, mails the OLD address a notice with a 24-hour cancel link, and mails the new address a welcome.
// A change whose code is never entered changes nothing; the old address is told once. Account host, same-origin JSON only.
const NO_STORE = { "cache-control": "no-store" };
const PASSWORD_STATUS = { wrong_password: 403, no_password: 409, too_many_attempts: 429 } as const;
const START_STATUS = { invalid: 422, same: 422, unavailable: 422, too_soon: 429 } as const;
const CONFIRM_STATUS = { wrong_code: 422, expired: 422, too_many_tries: 429, nothing_pending: 409, unavailable: 422 } as const;

export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  try {
    const pool = identityPool();
    return Response.json({ status: "ok", pending: await pendingChange(pool, ref.sub), twoFactor: (await twoFactorStatus(pool, ref.sub)).enabled }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { action?: unknown; password?: unknown; email?: unknown; code?: unknown; totp?: unknown } | null;
  const action = body?.action;
  if (action !== "start" && action !== "confirm") return Response.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  const secret = process.env.AUTH_SECRET;
  if (!secret) return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  try {
    const pool = identityPool();
    const profile = await getProfile(pool, ref.sub);
    if (!profile) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });

    if (action === "start") {
      const checked = await confirmPassword(pool, (await idp().$context).password, ref.sub, body?.password);
      if (checked !== "ok") return Response.json({ status: checked }, { status: PASSWORD_STATUS[checked], headers: NO_STORE });
      // When two-step verification is on, the authenticator code is needed too (checked against the person's own provider session).
      if ((await twoFactorStatus(pool, ref.sub)).enabled) {
        const totp = typeof body?.totp === "string" ? body.totp.trim() : "";
        if (!/^\d{6}$/.test(totp)) return Response.json({ status: "two_factor_required" }, { status: 403, headers: NO_STORE });
        const provider = idp();
        const headers = await providerSessionHeaders(provider, pool, ref.sid, ref.sub);
        if (!headers) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
        const good = await provider.api.verifyTOTP({ body: { code: totp }, headers }).then(() => true, () => false);
        if (!good) return Response.json({ status: "wrong_two_factor" }, { status: 403, headers: NO_STORE });
      }
      // A change from earlier whose code ran out unused: its old address is told now, before it is replaced.
      for (const n of await claimExpiredNotices(pool, new Date(), ref.sub)) await sendNotYou(n.oldEmail);
      // The Platform's own copy must not already hold the address either. The answer is the same as for any other refusal of the address.
      if (typeof body?.email === "string" && (await platformEmailTaken(normaliseEmail(body.email), ref.session.userId))) return Response.json({ status: "unavailable" }, { status: 422, headers: NO_STORE });
      const started = await startChange(pool, secret, { id: ref.sub, email: profile.email }, body?.email);
      if (!started.ok) return Response.json({ status: started.reason }, { status: START_STATUS[started.reason], headers: NO_STORE });
      try {
        await sendAuthEmail({ to: started.to, subject: `Your Platterly code: ${started.code}`, text: `Use this code to confirm this address as your new Platterly sign-in email:\n\n${started.code}\n\nIt expires in 10 minutes. If you did not ask for it, you can ignore this message.` });
      } catch {
        return Response.json({ status: "send_failed" }, { status: 502, headers: NO_STORE });
      }
      return Response.json({ status: "ok" }, { headers: NO_STORE });
    }

    const done = await confirmChange(pool, secret, ref.sub, body?.code, platformEmailSync);
    if (!done.ok) return Response.json({ status: done.reason }, { status: CONFIRM_STATUS[done.reason], headers: NO_STORE });
    // Every session ends, this one too, through the provider so products are told. The person signs in again with the new address.
    await endAllSessions(pool, ref.sub, await providerSessionEnder(idp()));
    await audit(ref.session.userId, "account.email_changed");
    await emitCurrentPersonProfile(ref.sub);
    await notify(done.oldEmail, done.newEmail, done.cancelToken);
    return Response.json({ status: "ok", email: done.newEmail, cancelUntil: done.cancelUntil.toISOString() }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

/** The OLD address gets the notice with the cancel link; the new one gets a welcome. A mail failure never undoes the change; it is logged without addresses. */
async function notify(oldEmail: string, newEmail: string, cancelToken: string) {
  const link = `${accountOrigin()}/email-change/cancel?token=${encodeURIComponent(cancelToken)}`;
  try {
    await sendAuthEmail({ to: oldEmail, subject: "Your Platterly sign-in email was changed", text: `The sign-in email for your Platterly account was just changed to ${newEmail}.\n\nIf this was you, there is nothing to do.\n\nIf this was NOT you, cancel the change within ${CANCEL_HOURS} hours with this link. You will be asked why, and the account will be put on hold until Platterly has verified you:\n\n${link}` });
  } catch (error) {
    console.error("email change notice (old address) failed", error instanceof Error ? error.message : "unknown");
  }
  try {
    await sendAuthEmail({ to: newEmail, subject: "This is now your Platterly sign-in email", text: "Your Platterly account now uses this address to sign in. You were signed out on all devices." });
  } catch (error) {
    console.error("email change notice (new address) failed", error instanceof Error ? error.message : "unknown");
  }
}

async function audit(userId: string, action: string) {
  try {
    await prisma.$transaction((tx) => writeAudit(tx, { action, outcome: "done", initiator: { kind: "user", ref: userId }, executor: { kind: "system", ref: "account" }, subject: { type: "user", id: userId } }));
  } catch (error) {
    console.error("email change audit write failed", error instanceof Error ? error.message : "unknown");
  }
}
