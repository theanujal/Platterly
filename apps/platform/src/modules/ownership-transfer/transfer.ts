import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "../audit/write-audit";
import { InvalidInputError, OrganisationNotFoundError, type Context, type Result } from "../organisations/errors";
import { replaceAdmin } from "../organisations/admin";
import { lockOrganisation } from "../organisations/lock";
import { allocateSlot } from "../organisations/slots";
import { refuse } from "../organisations/support";
import { findUserIdByEmail, getAccountUser } from "../users/standing";

// Admin transfer by invitation (AJ, 2026-11-10 and 2026-11-13). The Admin invites one person by email; when that person accepts, the Admin role moves to them
// and the old Admin stays on as a read-only "former_admin" (Caterly shows it as "Old Admin") until the new Admin removes them.
//
// Rules (AJ): the nominee holds no place in any product and no membership anywhere (promoting an employee is never the case); a transfer is blocked while an email
// change can still be cancelled, while the account is on hold, and while the business is ownership-locked or not active. Ops recovery is later.
//
// The email-change and hold facts live in the identity database, so the CALLER reads them and passes them in `guards`; this module sees only the Platform database.
// Like every organisation service it takes the caller's transaction, locks the one organisation, writes one audit row per change or refusal, and never commits.
export const TRANSFER_TTL_DAYS = 7;
export type Guards = { adminEmailChangeOpen: boolean; adminOnHold: boolean };
type Tx = Prisma.TransactionClient;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const normaliseEmail = (email: string) => email.trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Locked = Awaited<ReturnType<typeof lockOrganisation>>;

/** The checks that apply to every step that moves ownership. */
async function blockers(tx: Tx, ctx: Context, organisationId: string, org: Locked & { ownershipLocked?: boolean }, guards: Guards, action: string) {
  if (org.status !== "active") return refuse(tx, ctx, action, organisationId, "organisation_not_active");
  const { ownershipLocked } = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { ownershipLocked: true } });
  if (ownershipLocked) return refuse(tx, ctx, action, organisationId, "ownership_locked");
  if (guards.adminOnHold) return refuse(tx, ctx, action, organisationId, "account_on_hold");
  if (guards.adminEmailChangeOpen) return refuse(tx, ctx, action, organisationId, "email_change_open");
  return null;
}

const activeAdmin = (tx: Tx, organisationId: string) => tx.organisationMember.findFirst({ where: { organisationId, centralRole: "admin", status: "active" }, select: { id: true, userId: true } });

/** Anyone who already belongs to ANY business, in any role, or holds any product place, cannot be the nominee. */
async function holdsAnything(tx: Tx, userId: string): Promise<boolean> {
  const [members, slots] = await Promise.all([tx.organisationMember.count({ where: { userId } }), tx.membershipProductSlot.count({ where: { userId } })]);
  return members + slots > 0;
}

async function resolve(tx: Tx, ctx: Context, t: { id: string; organisationId: string }, status: "accepted" | "declined" | "cancelled" | "expired", now: Date, acceptedUserId?: string) {
  await tx.ownershipTransfer.update({ where: { id: t.id }, data: { status, resolvedAt: now, ...(acceptedUserId ? { acceptedUserId } : {}) }, select: { id: true } });
  await writeAudit(tx, { action: `ownership.${status}`, outcome: "done", initiator: ctx.initiator, executor: ctx.executor, organisationId: t.organisationId, subject: { type: "ownership_transfer", id: t.id }, requestId: ctx.requestId });
}

export type StartInput = { organisationId: string; adminUserId: string; nomineeEmail: string; guards: Guards; now?: Date };

/** The Admin invites someone. Returns the secret token once (only its hash is kept); the route emails the link. */
export async function startTransfer(tx: Tx, ctx: Context, input: StartInput): Promise<Result<{ transferId: string; token: string; nomineeEmail: string; expiresAt: Date }>> {
  const now = input.now ?? new Date();
  const nomineeEmail = normaliseEmail(input.nomineeEmail);
  if (!EMAIL.test(nomineeEmail) || nomineeEmail.length > 254) throw new InvalidInputError("the nominee needs a valid email address");
  const org = await lockOrganisation(tx, input.organisationId);
  const action = "ownership.started";
  const admin = await activeAdmin(tx, input.organisationId);
  if (!admin || admin.userId !== input.adminUserId) return refuse(tx, ctx, action, input.organisationId, "not_the_admin");
  const blocked = await blockers(tx, ctx, input.organisationId, org, input.guards, action);
  if (blocked) return blocked;
  const stale = await tx.ownershipTransfer.findFirst({ where: { organisationId: input.organisationId, status: "pending" }, select: { id: true, organisationId: true, expiresAt: true } });
  if (stale) {
    if (stale.expiresAt > now) return refuse(tx, ctx, action, input.organisationId, "transfer_pending");
    await resolve(tx, ctx, stale, "expired", now);
  }
  const me = await getAccountUser(tx, admin.userId);
  if (me && normaliseEmail(me.email) === nomineeEmail) return refuse(tx, ctx, action, input.organisationId, "nominee_is_self");
  const existingId = await findUserIdByEmail(tx, nomineeEmail);
  if (existingId && (await holdsAnything(tx, existingId))) return refuse(tx, ctx, action, input.organisationId, "nominee_holds_a_slot");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + TRANSFER_TTL_DAYS * 86_400_000);
  const row = await tx.ownershipTransfer.create({ data: { organisationId: input.organisationId, fromMemberId: admin.id, nomineeEmail, tokenHash: hashToken(token), expiresAt }, select: { id: true } });
  await writeAudit(tx, { action, outcome: "done", initiator: ctx.initiator, executor: ctx.executor, organisationId: input.organisationId, subject: { type: "ownership_transfer", id: row.id }, after: { nomineeEmail, expiresAt: expiresAt.toISOString() }, requestId: ctx.requestId });
  return { ok: true, transferId: row.id, token, nomineeEmail, expiresAt };
}

/** Finds a transfer from its secret link; the caller then runs a step inside a transaction for that organisation. */
export async function findTransferByToken(tx: Pick<Tx, "ownershipTransfer">, token: string) {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
  return tx.ownershipTransfer.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, organisationId: true, status: true, nomineeEmail: true, expiresAt: true } });
}

export type AcceptInput = { token: string; userId: string; guards: Guards; now?: Date };

/** The nominee accepts: the Admin role moves, the old Admin becomes a former Admin, the new Admin takes a place in every linked product. */
export async function acceptTransfer(tx: Tx, ctx: Context, input: AcceptInput): Promise<Result<{ organisationId: string; newAdminMemberId: string; formerAdminUserId: string }>> {
  const now = input.now ?? new Date();
  const found = await findTransferByToken(tx, input.token);
  if (!found) throw new OrganisationNotFoundError("no transfer for this link");
  const org = await lockOrganisation(tx, found.organisationId);
  const action = "ownership.accepted";
  const t = await tx.ownershipTransfer.findUniqueOrThrow({ where: { id: found.id } });
  if (t.status !== "pending") return refuse(tx, ctx, action, t.organisationId, "transfer_not_pending", { status: t.status });
  if (t.expiresAt <= now) {
    await resolve(tx, ctx, t, "expired", now);
    return { ok: false, code: "transfer_expired" };
  }
  const blocked = await blockers(tx, ctx, t.organisationId, org, input.guards, action);
  if (blocked) return blocked;
  const user = await getAccountUser(tx, input.userId);
  if (!user || user.status !== "active" || !user.emailVerified || normaliseEmail(user.email) !== t.nomineeEmail) return refuse(tx, ctx, action, t.organisationId, "nominee_email_mismatch");
  if (await holdsAnything(tx, user.id)) return refuse(tx, ctx, action, t.organisationId, "nominee_holds_a_slot");
  const swap = await replaceAdmin(tx, ctx, { organisationId: t.organisationId, expectedPreviousMemberId: t.fromMemberId, newUserId: user.id, previousBecomes: "former_admin" });
  if (!swap.ok) return swap;
  const products = await tx.organisationProduct.findMany({ where: { organisationId: t.organisationId }, select: { productKey: true }, orderBy: { productKey: "asc" } });
  for (const p of products) await allocateSlot(tx, ctx, { organisationId: t.organisationId, productKey: p.productKey, memberId: swap.current.memberId, userId: user.id, cause: "ownership_transfer" });
  await resolve(tx, ctx, t, "accepted", now, user.id);
  return { ok: true, organisationId: t.organisationId, newAdminMemberId: swap.current.memberId, formerAdminUserId: swap.previous?.userId ?? "" };
}

/** The nominee says no (needs the link and the matching verified account). */
export async function declineTransfer(tx: Tx, ctx: Context, input: { token: string; userId: string; now?: Date }): Promise<Result<{ organisationId: string }>> {
  const now = input.now ?? new Date();
  const found = await findTransferByToken(tx, input.token);
  if (!found) throw new OrganisationNotFoundError("no transfer for this link");
  await lockOrganisation(tx, found.organisationId);
  const action = "ownership.declined";
  const t = await tx.ownershipTransfer.findUniqueOrThrow({ where: { id: found.id } });
  if (t.status !== "pending") return refuse(tx, ctx, action, t.organisationId, "transfer_not_pending", { status: t.status });
  if (t.expiresAt <= now) {
    await resolve(tx, ctx, t, "expired", now);
    return { ok: false, code: "transfer_expired" };
  }
  const user = await getAccountUser(tx, input.userId);
  if (!user || user.status !== "active" || !user.emailVerified || normaliseEmail(user.email) !== t.nomineeEmail) return refuse(tx, ctx, action, t.organisationId, "nominee_email_mismatch");
  await resolve(tx, ctx, t, "declined", now);
  return { ok: true, organisationId: t.organisationId };
}

/** The Admin withdraws a pending invitation. A finished transfer cannot be cancelled. */
export async function cancelTransfer(tx: Tx, ctx: Context, input: { organisationId: string; adminUserId: string; now?: Date }): Promise<Result<{ transferId: string }>> {
  const now = input.now ?? new Date();
  await lockOrganisation(tx, input.organisationId);
  const action = "ownership.cancelled";
  const admin = await activeAdmin(tx, input.organisationId);
  if (!admin || admin.userId !== input.adminUserId) return refuse(tx, ctx, action, input.organisationId, "not_the_admin");
  const t = await tx.ownershipTransfer.findFirst({ where: { organisationId: input.organisationId, status: "pending" } });
  if (!t) return refuse(tx, ctx, action, input.organisationId, "transfer_not_found");
  if (t.expiresAt <= now) {
    await resolve(tx, ctx, t, "expired", now);
    return { ok: false, code: "transfer_expired" };
  }
  await resolve(tx, ctx, t, "cancelled", now);
  return { ok: true, transferId: t.id };
}

/** Housekeeping (scheduled job): records an invitation that ran out. Expiry is recorded even while the business is locked. */
export async function expireTransfer(tx: Tx, ctx: Context, transferId: string, now: Date = new Date()): Promise<boolean> {
  const t = await tx.ownershipTransfer.findUnique({ where: { id: transferId } });
  if (!t) return false;
  await lockOrganisation(tx, t.organisationId);
  const fresh = await tx.ownershipTransfer.findUniqueOrThrow({ where: { id: transferId } });
  if (fresh.status !== "pending" || fresh.expiresAt > now) return false;
  await resolve(tx, ctx, fresh, "expired", now);
  return true;
}
