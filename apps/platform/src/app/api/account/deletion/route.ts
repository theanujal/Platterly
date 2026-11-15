import { prisma } from "@/lib/db";
import { hostKind, requestHost } from "@/lib/routing/hosts";
import { getSessionRef } from "@/lib/session";
import { writeAudit } from "@/modules/audit/write-audit";
import { cancelDeletion, getDeletionStatus, requestDeletion } from "@/modules/account/data-rights";
import { loadAccountOverview } from "@/modules/account/overview";
import { confirmPassword } from "@/modules/account/confirm-password";
import { getProfile } from "@/modules/account/profile";
import { accountOrigin } from "@/modules/auth/config";
import { identityPool } from "@/modules/auth/identity-db";
import { idp } from "@/modules/auth/idp";
import { sendAuthEmail } from "@/modules/auth/mailer";
import { deletionRequestEmail } from "@/modules/auth/email-templates";
import { sendRequestToOps, sendWithdrawalToOps, syncDeletionRequests } from "@/modules/account/deletion-ops";

// GET /api/account/deletion: whether a deletion request is pending. POST {"password", "reason"?}: ask for the account to be deleted (the password is asked
// again). DELETE: withdraw a pending request. One request covers the account and, for a business Admin, the business. It goes to Ops, where staff approve or
// decline; nothing here deletes anything. A plain member of a business's team cannot ask (their Admin manages them). Account host only; writes take same-origin JSON.
const NO_STORE = { "cache-control": "no-store" };
const STATUS = { wrong_password: 403, no_password: 409, too_many_attempts: 429 } as const;

async function caller(request: Request, write: boolean) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (write && request.method !== "DELETE" && (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json"))) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  if (write && request.method === "DELETE" && request.headers.get("origin") !== accountOrigin()) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const ref = await getSessionRef();
  return ref ?? Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
}

/** A person on a business's product team (its roster, by email) who is not the business's Admin cannot ask for deletion: the Admin manages the team. */
async function isTeamMember(providerUserId: string): Promise<boolean> {
  const profile = await getProfile(identityPool(), providerUserId);
  if (!profile) return false;
  return !!(await prisma.organisationTeamMember.findFirst({ where: { email: { equals: profile.email, mode: "insensitive" } }, select: { id: true } }));
}

export async function GET(request: Request) {
  const who = await caller(request, false);
  if (who instanceof Response) return who;
  try {
    // Pick up a decision Ops has made since the person last looked.
    await syncDeletionRequests(identityPool(), {}, who.sub).catch(() => undefined);
    const status = await getDeletionStatus(identityPool(), who.sub);
    const overview = await loadAccountOverview(prisma, who.session);
    // An Admin (or former Admin) has a business and is handled by the business rule; only someone with no business of their own can be a plain team member.
    const teamMember = overview.status === "ok" && overview.overview.business.state === "none" && (await isTeamMember(who.sub));
    return Response.json({ ...status, teamMember }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  const who = await caller(request, true);
  if (who instanceof Response) return who;
  const body = (await request.json().catch(() => null)) as { password?: unknown; reason?: unknown } | null;
  try {
    const checked = await confirmPassword(identityPool(), (await idp().$context).password, who.sub, body?.password);
    if (checked !== "ok") return Response.json({ status: checked }, { status: STATUS[checked], headers: NO_STORE });
    const overview = await loadAccountOverview(prisma, who.session);
    // An active business (or one the person's membership still points at) must be handed over or closed first. A failed read blocks rather than allows.
    if (overview.status !== "ok") return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
    const business = overview.overview.business;
    if (business.state === "none" && (await isTeamMember(who.sub))) return Response.json({ status: "team_member" }, { status: 409, headers: NO_STORE });
    const profile = await getProfile(identityPool(), who.sub);
    if (!profile) return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
    const details = {
      subject: who.sub,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      businessId: business.state === "ok" ? business.business.id : null,
      businessName: business.state === "ok" ? business.business.name : null,
      products: business.state === "ok" ? Object.entries(business.products).filter(([, link]) => link === "linked").map(([key]) => key) : [],
    };
    const result = await requestDeletion(identityPool(), who.sub, { details, reason: body?.reason });
    if (!result.ok) return Response.json({ status: result.reason }, { status: 409, headers: NO_STORE });
    await audit(who.session.userId, "account.deletion_requested");
    // Ops is told now; if it is down the scheduled job tells it again.
    await sendRequestToOps(identityPool(), result.payload.requestId).catch(() => undefined);
    await notify(who.sub);
    return Response.json({ status: "ok" }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(request: Request) {
  const who = await caller(request, true);
  if (who instanceof Response) return who;
  try {
    const id = await cancelDeletion(identityPool(), who.sub);
    if (id) {
      await audit(who.session.userId, "account.deletion_request_withdrawn");
      await sendWithdrawalToOps(identityPool(), id).catch(() => undefined);
    }
    return Response.json({ status: id ? "ok" : "none" }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

async function notify(providerUserId: string) {
  try {
    const profile = await getProfile(identityPool(), providerUserId);
    if (profile) await sendAuthEmail({ to: profile.email, ...deletionRequestEmail() });
  } catch (error) {
    console.error("deletion notice failed", error instanceof Error ? error.message : "unknown");
  }
}

async function audit(userId: string, action: string) {
  try {
    await prisma.$transaction((tx) => writeAudit(tx, { action, outcome: "done", initiator: { kind: "user", ref: userId }, executor: { kind: "system", ref: "account" }, subject: { type: "user", id: userId } }));
  } catch (error) {
    console.error("deletion audit write failed", error instanceof Error ? error.message : "unknown");
  }
}
