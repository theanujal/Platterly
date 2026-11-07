import { prisma } from "@/lib/db";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { writeAudit } from "@/modules/audit/write-audit";
import { accountOrigin } from "@/modules/auth/config";
import { identityPool } from "@/modules/auth/identity-db";
import { idp } from "@/modules/auth/idp";
import { sendAuthEmail } from "@/modules/auth/mailer";
import { providerSessionEnder } from "@/modules/auth/provider-sessions";
import { changePassword } from "@/modules/account/password";
import { getProfile } from "@/modules/account/profile";

// POST /api/account/password  {"current": "...", "next": "..."}. Account host, same-origin JSON only. The person is whoever the verified session says.
// The new password is never logged, audited or echoed. On success the person gets a security notice by email and every other session ends.
const NO_STORE = { "cache-control": "no-store" };
const REFUSALS = { wrong_password: 403, weak: 422, same: 422, no_password: 409, too_many_attempts: 429 } as const;

export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { current?: unknown; next?: unknown } | null;
  if (!body || typeof body !== "object") return Response.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  try {
    const provider = idp();
    const context = await provider.$context;
    const result = await changePassword(identityPool(), context.password, { userId: ref.sub, currentSessionId: ref.sid, current: body.current, next: body.next }, await providerSessionEnder(provider));
    if (!result.ok) {
      await audit(ref.session.userId, "refused", result.reason);
      return Response.json({ status: result.reason }, { status: REFUSALS[result.reason], headers: NO_STORE });
    }
    await audit(ref.session.userId, "done");
    await notify(ref.sub);
    return Response.json({ status: "ok", endedOthers: result.endedOthers }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

/** Security notices are mandatory. A mail failure never undoes the change; it is logged (without the address). */
async function notify(providerUserId: string) {
  try {
    const profile = await getProfile(identityPool(), providerUserId);
    if (!profile) return;
    await sendAuthEmail({ to: profile.email, subject: "Your Platterly password was changed", text: "The password for your Platterly account was just changed, and you were signed out on your other devices.\n\nIf this was not you, reset your password now and contact Platterly support." });
  } catch (error) {
    console.error("password-change notice failed", error instanceof Error ? error.message : "unknown");
  }
}

async function audit(userId: string, outcome: "done" | "refused", reasonCode?: string) {
  try {
    await prisma.$transaction((tx) =>
      writeAudit(tx, { action: "account.password_changed", outcome, reasonCode, initiator: { kind: "user", ref: userId }, executor: { kind: "system", ref: "account" }, subject: { type: "user", id: userId } }),
    );
  } catch (error) {
    console.error("password audit write failed", error instanceof Error ? error.message : "unknown");
  }
}
