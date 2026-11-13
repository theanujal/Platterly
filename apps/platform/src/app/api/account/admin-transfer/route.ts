import { prisma } from "@/lib/db";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { confirmSensitive } from "@/modules/account/confirm-sensitive";
import { getProfile } from "@/modules/account/profile";
import { accountOrigin } from "@/modules/auth/config";
import { adminTransferCancelledEmail, adminTransferInviteEmail, adminTransferSentEmail } from "@/modules/auth/email-templates";
import { identityPool } from "@/modules/auth/identity-db";
import { idp } from "@/modules/auth/idp";
import { sendAuthEmail } from "@/modules/auth/mailer";
import { twoFactorStatus } from "@/modules/account/two-factor";
import { cancelTransfer, startTransfer, TRANSFER_TTL_DAYS } from "@/modules/ownership-transfer";
import { readGuards } from "@/modules/ownership-transfer/guards";

// The Business Admin's side of an Admin transfer. GET: who the caller is in their business (Admin, former Admin or none), any pending invitation, and why a new
// one cannot be sent right now. POST {action: "start", email, password, totp?} invites one person; {action: "cancel", password, totp?} withdraws the pending
// invitation. Both need the password again, and the authenticator or a backup code when two-step verification is on. Account host, same-origin JSON only.
const NO_STORE = { "cache-control": "no-store" };
const REFUSAL_HTTP: Record<string, number> = { not_the_admin: 403, ownership_locked: 409, organisation_not_active: 409, email_change_open: 409, account_on_hold: 409, transfer_pending: 409, nominee_is_self: 422, nominee_holds_a_slot: 422, transfer_not_found: 404 };

async function membership(userId: string) {
  return prisma.organisationMember.findFirst({
    where: { userId, status: "active", centralRole: { in: ["admin", "former_admin"] } },
    select: { id: true, centralRole: true, organisationId: true, organisation: { select: { name: true, status: true, ownershipLocked: true } } },
  });
}

export async function GET(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  try {
    const m = await membership(ref.session.userId);
    if (!m) return Response.json({ status: "ok", role: "none" }, { headers: NO_STORE });
    const pool = identityPool();
    const twoFactor = (await twoFactorStatus(pool, ref.sub)).enabled;
    if (m.centralRole !== "admin") return Response.json({ status: "ok", role: "former_admin", businessName: m.organisation.name, twoFactor }, { headers: NO_STORE });
    const pending = await prisma.ownershipTransfer.findFirst({ where: { organisationId: m.organisationId, status: "pending", expiresAt: { gt: new Date() } }, select: { nomineeEmail: true, expiresAt: true } });
    const guards = await readGuards(pool, ref.sub);
    const blocked = m.organisation.status !== "active" ? "organisation_not_active" : m.organisation.ownershipLocked ? "ownership_locked" : guards.adminOnHold ? "account_on_hold" : guards.adminEmailChangeOpen ? "email_change_open" : null;
    return Response.json({ status: "ok", role: "admin", businessName: m.organisation.name, twoFactor, blocked, pending: pending ? { nomineeEmail: pending.nomineeEmail, expiresAt: pending.expiresAt.toISOString() } : null }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json")) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const ref = await getSessionRef();
  if (!ref) return Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { action?: unknown; email?: unknown; password?: unknown; totp?: unknown; backupCode?: unknown } | null;
  if (body?.action !== "start" && body?.action !== "cancel") return Response.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  try {
    const pool = identityPool();
    const m = await membership(ref.session.userId);
    if (!m || m.centralRole !== "admin") return Response.json({ status: "not_the_admin" }, { status: 403, headers: NO_STORE });
    const provider = idp();
    const confirmed = await confirmSensitive(pool, provider, (await provider.$context).password, ref, body);
    if (!confirmed.ok) return Response.json({ status: confirmed.status }, { status: confirmed.http, headers: NO_STORE });
    const ctx = { initiator: { kind: "user" as const, ref: ref.session.userId }, executor: { kind: "system" as const, ref: "account" } };
    const profile = await getProfile(pool, ref.sub);

    if (body.action === "cancel") {
      const found = await prisma.ownershipTransfer.findFirst({ where: { organisationId: m.organisationId, status: "pending" }, select: { nomineeEmail: true } });
      const result = await prisma.$transaction((tx) => cancelTransfer(tx, ctx, { organisationId: m.organisationId, adminUserId: ref.session.userId }));
      if (!result.ok) return Response.json({ status: result.code }, { status: REFUSAL_HTTP[result.code] ?? 409, headers: NO_STORE });
      if (found) await sendAuthEmail({ to: found.nomineeEmail, ...adminTransferCancelledEmail(m.organisation.name) }).catch((e) => console.error("transfer notice failed", e instanceof Error ? e.message : "unknown"));
      return Response.json({ status: "ok" }, { headers: NO_STORE });
    }

    if (typeof body.email !== "string") return Response.json({ status: "invalid_email" }, { status: 422, headers: NO_STORE });
    const guards = await readGuards(pool, ref.sub);
    const result = await prisma.$transaction((tx) => startTransfer(tx, ctx, { organisationId: m.organisationId, adminUserId: ref.session.userId, nomineeEmail: body.email as string, guards })).catch((e: unknown) => (e instanceof Error && /valid email/.test(e.message) ? ("invalid_email" as const) : Promise.reject(e)));
    if (result === "invalid_email") return Response.json({ status: "invalid_email" }, { status: 422, headers: NO_STORE });
    if (!result.ok) return Response.json({ status: result.code }, { status: REFUSAL_HTTP[result.code] ?? 409, headers: NO_STORE });
    const acceptUrl = `${accountOrigin()}/admin-transfer?invite=${encodeURIComponent(result.token)}`;
    const fromName = profile?.name || "The current Admin";
    // The invitation is the point of the request: if it cannot be sent, the Admin is told so and can withdraw it and try again.
    await sendAuthEmail({ to: result.nomineeEmail, ...adminTransferInviteEmail(m.organisation.name, fromName, acceptUrl, TRANSFER_TTL_DAYS) });
    if (profile) await sendAuthEmail({ to: profile.email, ...adminTransferSentEmail(result.nomineeEmail, m.organisation.name, TRANSFER_TTL_DAYS) }).catch((e) => console.error("transfer notice failed", e instanceof Error ? e.message : "unknown"));
    return Response.json({ status: "ok", nomineeEmail: result.nomineeEmail, expiresAt: result.expiresAt.toISOString() }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin transfer failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}
