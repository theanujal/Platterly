import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "../audit/write-audit";
import { InvalidInputError, type Context, type Result } from "./errors";
import { lockOrganisation } from "./lock";
import { refuse, queueMembership } from "./support";

// F3.2.2 central Admin replacement (docs/single-business-admin-invariant-design-proposal.md, 6.2). This file is the ONLY place that writes
// central Admin rows (a static guard test enforces it, I-6). `replaceAdmin` changes central Admin rows only: it creates, moves and releases
// NO product slot (I-7); slot steps belong to the route that calls it. The database backs it up: at most one active Admin (partial unique
// index) and, once established, exactly one at every commit (deferred triggers).
//
// Reappointing a former Admin (a `disabled` or `removed` row for the same person) is refused: that is policy P6, deferred by AJ, so no route is
// invented here. (The proposal's step 4 would promote the row; that waits for P6.)
export type AdminTx = Pick<Prisma.TransactionClient, "organisationMember">;
export type AdminSwap = { previous: { memberId: string; userId: string } | null; current: { memberId: string; userId: string } };
export type SwapRefusal = { refused: "admin_mismatch" | "admin_exists" | "already_admin_elsewhere" | "same_admin" | "former_admin_reappointment_not_decided"; detail?: Record<string, string> };

/** One person is the active Admin of at most one business (AJ, 2026-11-07); a second business needs a different sign-in. The database enforces it too. */
export async function isAdminElsewhere(tx: AdminTx, userId: string, exceptOrganisationId?: string): Promise<boolean> {
  const row = await tx.organisationMember.findFirst({ where: { userId, centralRole: "admin", status: "active", ...(exceptOrganisationId ? { organisationId: { not: exceptOrganisationId } } : {}) }, select: { id: true } });
  return row !== null;
}

/** Demote the expected previous Admin first, then insert the new one (the unique index forbids two active Admins even inside the transaction). */
export async function swapAdminRows(tx: AdminTx, organisationId: string, expectedPreviousMemberId: string | null, newUserId: string, previousBecomes: PreviousBecomes = "disabled"): Promise<AdminSwap | SwapRefusal> {
  const active = await tx.organisationMember.findFirst({ where: { organisationId, centralRole: "admin", status: "active" }, select: { id: true, userId: true } });
  if (expectedPreviousMemberId === null) {
    if (active) return { refused: "admin_exists" };
  } else if (!active || active.id !== expectedPreviousMemberId) {
    return { refused: "admin_mismatch" };
  }
  if (active && active.userId === newUserId) return { refused: "same_admin" };
  if (await isAdminElsewhere(tx, newUserId, organisationId)) return { refused: "already_admin_elsewhere" };
  const existing = await tx.organisationMember.findUnique({ where: { organisationId_userId: { organisationId, userId: newUserId } }, select: { id: true } });
  if (existing) return { refused: "former_admin_reappointment_not_decided" };
  // Staff recovery locks the old Admin out ("disabled"). A transfer by invitation keeps them on as a read-only member ("former_admin", still active, AJ 2026-11-13).
  if (active) await tx.organisationMember.update({ where: { id: active.id }, data: previousBecomes === "former_admin" ? { centralRole: "former_admin" } : { status: "disabled" }, select: { id: true } });
  const created = await tx.organisationMember.create({ data: { organisationId, userId: newUserId, centralRole: "admin", status: "active" }, select: { id: true, userId: true } });
  return { previous: active ? { memberId: active.id, userId: active.userId } : null, current: { memberId: created.id, userId: created.userId } };
}

export const isRefusal = (r: AdminSwap | SwapRefusal): r is SwapRefusal => "refused" in r;

export type PreviousBecomes = "disabled" | "former_admin";
export type ReplaceAdminInput = { organisationId: string; expectedPreviousMemberId: string | null; newUserId: string; previousBecomes?: PreviousBecomes };

export async function replaceAdmin(tx: Prisma.TransactionClient, ctx: Context, input: ReplaceAdminInput): Promise<Result<{ previous: AdminSwap["previous"]; current: AdminSwap["current"] }>> {
  if (!input.newUserId) throw new InvalidInputError("a new Admin is required");
  await lockOrganisation(tx, input.organisationId);
  const swap = await swapAdminRows(tx, input.organisationId, input.expectedPreviousMemberId, input.newUserId, input.previousBecomes);
  if (isRefusal(swap)) return refuse(tx, ctx, "admin.replaced", input.organisationId, swap.refused, swap.detail);
  const { membershipVersion } = await tx.organisation.update({ where: { id: input.organisationId }, data: { membershipVersion: { increment: 1 } }, select: { membershipVersion: true } });
  await writeAudit(tx, {
    action: "admin.replaced",
    outcome: "done",
    initiator: ctx.initiator,
    executor: ctx.executor,
    organisationId: input.organisationId,
    subject: { type: "organisation", id: input.organisationId },
    before: { adminMemberId: swap.previous?.memberId ?? null },
    after: { adminMemberId: swap.current.memberId },
    requestId: ctx.requestId,
  });
  if (swap.previous) {
    const kept = input.previousBecomes === "former_admin";
    await queueMembership(tx, input.organisationId, { userId: swap.previous.userId, status: kept ? "active" : "disabled", role: kept ? "former_admin" : "admin", membershipVersion: Number(membershipVersion) });
  }
  await queueMembership(tx, input.organisationId, { userId: swap.current.userId, status: "active", membershipVersion: Number(membershipVersion) });
  return { ok: true, previous: swap.previous, current: swap.current };
}

