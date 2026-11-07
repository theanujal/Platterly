import { prisma } from "@/lib/db";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { writeAudit } from "@/modules/audit/write-audit";
import { confirmPassword } from "@/modules/account/confirm-password";
import { confirmChange, emailChangeHold, HOLD_HOURS, normaliseEmail, pendingChange, startChange } from "@/modules/account/email-change";
import { platformEmailSync, platformEmailTaken } from "@/modules/users/email-sync";
import { getProfile } from "@/modules/account/profile";
import { accountOrigin } from "@/modules/auth/config";
import { identityPool } from "@/modules/auth/identity-db";
import { idp } from "@/modules/auth/idp";
import { sendAuthEmail } from "@/modules/auth/mailer";
import { providerSessionEnder } from "@/modules/auth/provider-sessions";

// Change of sign-in email. GET: any change waiting for its code, and the 72-hour hold if one is open. POST {action}: "start" {password, email} mails a code to
// the NEW address; "confirm" {code} checks it, changes the email (identity and the Platform's copy together), ends every other session, mails the OLD address
// a notice with a 72-hour cancel link, and mails the new address a welcome. Account host, same-origin JSON only.
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
    return Response.json({ status: "ok", pending: await pendingChange(pool, ref.sub), hold: await emailChangeHold(pool, ref.sub) }, { headers: NO_STORE });
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
    // Every other session ends (this one stays), through the provider so products are told.
    const others = (await pool.query('select "token" from "session" where "userId" = $1 and "id" <> $2', [ref.sub, ref.sid])).rows.map((r) => r.token as string);
    if (others.length) await (await providerSessionEnder(idp())).deleteSessions(others);
    await audit(ref.session.userId, "account.email_changed");
    await notify(done.oldEmail, done.newEmail, done.cancelToken);
    return Response.json({ status: "ok", email: done.newEmail, holdUntil: done.holdUntil.toISOString() }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

/** The OLD address gets the notice with the cancel link; the new one gets a welcome. A mail failure never undoes the change; it is logged without addresses. */
async function notify(oldEmail: string, newEmail: string, cancelToken: string) {
  const link = `${accountOrigin()}/email-change/cancel?token=${encodeURIComponent(cancelToken)}`;
  try {
    await sendAuthEmail({ to: oldEmail, subject: "Your Platterly sign-in email was changed", text: `The sign-in email for your Platterly account was just changed to ${newEmail}.\n\nIf this was you, there is nothing to do.\n\nIf this was NOT you, cancel the change within ${HOLD_HOURS} hours with this link, then reset your password:\n\n${link}\n\nUntil then, ownership transfers and billing-contact changes on your account are on hold.` });
  } catch (error) {
    console.error("email change notice (old address) failed", error instanceof Error ? error.message : "unknown");
  }
  try {
    await sendAuthEmail({ to: newEmail, subject: "This is now your Platterly sign-in email", text: "Your Platterly account now uses this address to sign in. Your other devices were signed out." });
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
