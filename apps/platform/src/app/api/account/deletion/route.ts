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

// GET /api/account/deletion: whether a deletion request is pending. POST {"password", "reason"?}: ask for the account to be deleted (the password is asked
// again). DELETE: withdraw a pending request. Staff review requests and delete by hand; nothing here deletes anything. A person who still has an active
// business must hand it over or close it first. Account host only; writes take same-origin JSON.
const NO_STORE = { "cache-control": "no-store" };
const STATUS = { wrong_password: 403, no_password: 409, too_many_attempts: 429 } as const;

async function caller(request: Request, write: boolean) {
  if (hostKind(requestHost(request.headers)) !== "account") return Response.json({ error: "not_found" }, { status: 404 });
  if (write && request.method !== "DELETE" && (request.headers.get("origin") !== accountOrigin() || !(request.headers.get("content-type") ?? "").startsWith("application/json"))) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  if (write && request.method === "DELETE" && request.headers.get("origin") !== accountOrigin()) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const ref = await getSessionRef();
  return ref ?? Response.json({ status: "unauthenticated" }, { status: 401, headers: NO_STORE });
}

export async function GET(request: Request) {
  const who = await caller(request, false);
  if (who instanceof Response) return who;
  try {
    return Response.json(await getDeletionStatus(identityPool(), who.sub), { headers: NO_STORE });
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
    const hasBusiness = overview.overview.business.state === "ok";
    const result = await requestDeletion(identityPool(), who.sub, { hasBusiness, reason: body?.reason });
    if (!result.ok) return Response.json({ status: result.reason }, { status: 409, headers: NO_STORE });
    await audit(who.session.userId, "account.deletion_requested");
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
    const done = await cancelDeletion(identityPool(), who.sub);
    if (done) await audit(who.session.userId, "account.deletion_request_withdrawn");
    return Response.json({ status: done ? "ok" : "none" }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "error" }, { status: 500, headers: NO_STORE });
  }
}

async function notify(providerUserId: string) {
  try {
    const profile = await getProfile(identityPool(), providerUserId);
    if (profile) await sendAuthEmail({ to: profile.email, subject: "We received your Platterly account deletion request", text: "We received a request to delete your Platterly account. Our team reviews every request and will contact you before anything is deleted.\n\nIf you did not ask for this, sign in and withdraw the request on your Profile page, then change your password." });
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
