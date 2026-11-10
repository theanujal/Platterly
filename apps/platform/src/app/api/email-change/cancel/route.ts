import { prisma } from "@/lib/db";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { writeAudit } from "@/modules/audit/write-audit";
import { cancelChange } from "@/modules/account/email-change";
import { notifyOps } from "@/modules/account/hold";
import { platformEmailSync, platformUserIdForSubject } from "@/modules/users/email-sync";
import { emitCurrentPersonProfile } from "@/modules/outbox/person-profile";
import { accountOrigin } from "@/modules/auth/config";
import { identityPool } from "@/modules/auth/identity-db";
import { idp } from "@/modules/auth/idp";
import { sendAuthEmail } from "@/modules/auth/mailer";
import { providerSessionEnder } from "@/modules/auth/provider-sessions";
import { endAllSessions } from "@/modules/auth/session-store";
import { emailChangeCancelledEmail } from "@/modules/auth/email-templates";

// POST /api/email-change/cancel {"token": "...", "reason": {"code": "not_me" | "mistake" | "other", "note": "..."}}: the old address's cancel link. The token IS the
// credential (256 random bits, only a hash is stored), so no session is needed. Valid only inside the 24-hour window, and only with a reason. It puts the old email
// back (identity and the Platform's copy), signs the person out everywhere, puts the ACCOUNT ON HOLD until Ops staff verify the person, tells Ops, and tells both
// addresses. Account host, same-origin JSON only; the page asks for a click first so a mail scanner opening the link cannot cancel anything.
const NO_STORE = { "cache-control": "no-store" };
const STATUS = { invalid: 404, expired: 410, already_cancelled: 409, unavailable: 409, reason_required: 422 } as const;

export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { token?: unknown; reason?: unknown } | null;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  try {
    const pool = identityPool();
    const result = await cancelChange(pool, secret, body?.token, body?.reason, platformEmailSync);
    if (!result.ok) return Response.json({ status: result.reason }, { status: STATUS[result.reason], headers: NO_STORE });
    await endAllSessions(pool, result.userId, await providerSessionEnder(idp()));
    try {
      const ref = (await platformUserIdForSubject(result.userId)) ?? result.userId;
      await prisma.$transaction((tx) => writeAudit(tx, { action: "account.email_change_cancelled", outcome: "done", initiator: { kind: "user", ref }, executor: { kind: "system", ref: "account" }, subject: { type: "user", id: ref }, reasonCode: undefined, payload: { reason: (body?.reason as { code?: string } | null)?.code ?? null } }));
    } catch (error) {
      console.error("email change cancel audit failed", error instanceof Error ? error.message : "unknown");
    }
    await emitCurrentPersonProfile(result.userId);
    // Ops is told now; if it cannot be reached the hold still stands and the scheduled job (or the person's next sign-in attempt) tells it later.
    const reason = body?.reason as { code: "not_me" | "mistake" | "other"; note?: string };
    await notifyOps(pool, { userId: result.userId, reviewId: result.reviewId, oldEmail: result.restoredEmail, newEmail: result.newEmail, reason: reason.code, note: (reason.note ?? "").trim(), requestedAt: result.requestedAt }).catch(() => false);
    for (const to of [result.restoredEmail, result.newEmail]) {
      await sendAuthEmail({ to, ...emailChangeCancelledEmail() }).catch((error) => console.error("email change cancel notice failed", error instanceof Error ? error.message : "unknown"));
    }
    return Response.json({ status: "ok" }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}
