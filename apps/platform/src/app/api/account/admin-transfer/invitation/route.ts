import { prisma } from "@/lib/db";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { getProfile } from "@/modules/account/profile";
import { accountOrigin } from "@/modules/auth/config";
import { adminTransferAcceptedEmail, adminTransferDeclinedEmail, adminTransferWelcomeEmail } from "@/modules/auth/email-templates";
import { identityPool } from "@/modules/auth/identity-db";
import { sendAuthEmail } from "@/modules/auth/mailer";
import { acceptTransfer, declineTransfer, findTransferByToken, normaliseEmail } from "@/modules/ownership-transfer";
import { readGuards } from "@/modules/ownership-transfer/guards";
import { findSubjectForUser } from "@/modules/users/subject";

// The invited person's side. GET ?token=: what the invitation is (only shown to the signed-in person whose verified address it was sent to; anyone else is told it
// is not for them). POST {action: "accept" | "decline", token}: needs only the signed-in session, because the secret link plus the matching verified address is the
// proof. Account host, same-origin JSON only.
const NO_STORE = { "cache-control": "no-store" };
const REFUSAL_HTTP: Record<string, number> = { transfer_not_pending: 409, transfer_expired: 410, nominee_email_mismatch: 403, nominee_holds_a_slot: 409, ownership_locked: 409, organisation_not_active: 409, email_change_open: 409, account_on_hold: 409, not_the_admin: 409, admin_mismatch: 409 };

const mine = async (ref: { sub: string }) => (await getProfile(identityPool(), ref.sub)) ?? null;

export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const t = await findTransferByToken(prisma, token);
    const me = await mine(ref);
    if (!t || !me || !me.emailVerified || normaliseEmail(me.email) !== t.nomineeEmail) return Response.json({ status: "not_for_you" }, { headers: NO_STORE });
    if (t.status !== "pending") return Response.json({ status: t.status }, { headers: NO_STORE });
    if (t.expiresAt <= new Date()) return Response.json({ status: "expired" }, { headers: NO_STORE });
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: t.organisationId }, select: { name: true } });
    return Response.json({ status: "pending", businessName: org.name, expiresAt: t.expiresAt.toISOString() }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { action?: unknown; token?: unknown } | null;
  if ((body?.action !== "accept" && body?.action !== "decline") || typeof body.token !== "string") return Response.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  try {
    const pool = identityPool();
    const found = await findTransferByToken(prisma, body.token);
    if (!found) return Response.json({ status: "not_for_you" }, { status: 404, headers: NO_STORE });
    const ctx = { initiator: { kind: "user" as const, ref: ref.session.userId }, executor: { kind: "system" as const, ref: "account" } };
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: found.organisationId }, select: { name: true } });
    const adminRow = await prisma.organisationMember.findFirst({ where: { organisationId: found.organisationId, centralRole: "admin", status: "active" }, select: { userId: true } });
    const adminSub = adminRow ? await findSubjectForUser(prisma, adminRow.userId) : null;

    if (body.action === "decline") {
      const result = await prisma.$transaction((tx) => declineTransfer(tx, ctx, { token: body.token as string, userId: ref.session.userId }));
      if (!result.ok) return Response.json({ status: result.code }, { status: REFUSAL_HTTP[result.code] ?? 409, headers: NO_STORE });
      const admin = adminSub ? await getProfile(pool, adminSub) : null;
      if (admin) await sendAuthEmail({ to: admin.email, ...adminTransferDeclinedEmail(found.nomineeEmail, org.name) }).catch((e) => console.error("transfer notice failed", e instanceof Error ? e.message : "unknown"));
      return Response.json({ status: "ok" }, { headers: NO_STORE });
    }

    // The Admin's own email-change and hold state is what blocks the move (not the nominee's).
    const guards = adminSub ? await readGuards(pool, adminSub) : { adminEmailChangeOpen: false, adminOnHold: false };
    const result = await prisma.$transaction((tx) => acceptTransfer(tx, ctx, { token: body.token as string, userId: ref.session.userId, guards }));
    if (!result.ok) return Response.json({ status: result.code }, { status: REFUSAL_HTTP[result.code] ?? 409, headers: NO_STORE });
    const me = await mine(ref);
    const former = adminSub ? await getProfile(pool, adminSub) : null;
    if (former && me) await sendAuthEmail({ to: former.email, ...adminTransferAcceptedEmail(org.name, me.email) }).catch((e) => console.error("transfer notice failed", e instanceof Error ? e.message : "unknown"));
    if (me) await sendAuthEmail({ to: me.email, ...adminTransferWelcomeEmail(org.name) }).catch((e) => console.error("transfer notice failed", e instanceof Error ? e.message : "unknown"));
    return Response.json({ status: "ok", businessName: org.name }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin transfer reply failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}
