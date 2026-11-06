import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "../audit/write-audit";
import { assertProductKey, type Context, type Result } from "./errors";
import { lockOrganisation } from "./lock";
import { allocateSlot, releaseSlot, slotsTakenElsewhere } from "./slots";
import { queueMembership, refuse } from "./support";

// F3.2.2 product link and unlink (docs/w1-implementation-plan.md, F3.2.2 `linkProduct` and clarification D).

/** Link a product: every non-removed member (active or disabled) takes a slot. If any of them holds the product elsewhere the whole link is refused (counts only). */
export async function linkProduct(tx: Prisma.TransactionClient, ctx: Context, input: { organisationId: string; productKey: string }): Promise<Result<{ changed: boolean; slots: number }>> {
  assertProductKey(input.productKey);
  const { organisationId, productKey } = input;
  await lockOrganisation(tx, organisationId);
  const already = await tx.organisationProduct.findUnique({ where: { organisationId_productKey: { organisationId, productKey } }, select: { productKey: true } });
  if (already) return { ok: true, changed: false, slots: 0 };
  const members = await tx.organisationMember.findMany({ where: { organisationId, status: { not: "removed" } }, select: { id: true, userId: true, status: true }, orderBy: { createdAt: "asc" } });
  const taken = await slotsTakenElsewhere(tx, organisationId, productKey, members.map((m) => m.userId));
  if (taken > 0) return refuse(tx, ctx, "product.linked", organisationId, "slot_taken", { people: taken });

  await tx.organisationProduct.create({ data: { organisationId, productKey }, select: { productKey: true } });
  // A relink closes the latest tombstone.
  const tombstone = await tx.organisationProductUnlink.findFirst({ where: { organisationId, productKey, relinkedAt: null }, orderBy: { unlinkedAt: "desc" }, select: { id: true } });
  if (tombstone) await tx.organisationProductUnlink.update({ where: { id: tombstone.id }, data: { relinkedAt: new Date() }, select: { id: true } });
  for (const m of members) await allocateSlot(tx, ctx, { organisationId, productKey, memberId: m.id, userId: m.userId, cause: "product.linked" });
  const { membershipVersion } = await tx.organisation.update({ where: { id: organisationId }, data: { membershipVersion: { increment: 1 } }, select: { membershipVersion: true } });
  await writeAudit(tx, {
    action: "product.linked",
    outcome: "done",
    initiator: ctx.initiator,
    executor: ctx.executor,
    organisationId,
    subject: { type: "organisation", id: organisationId },
    after: { productKey, slotCount: members.length, memberIds: members.map((m) => m.id) },
    requestId: ctx.requestId,
  });
  for (const m of members) await queueMembership(tx, organisationId, { userId: m.userId, status: m.status as "active" | "disabled", membershipVersion: Number(membershipVersion) }, productKey);
  return { ok: true, changed: true, slots: members.length };
}

/** Clarification D, in order. The last link is never removed. Memberships, roles and statuses are not touched; only that product's slots go. */
export async function unlinkProduct(tx: Prisma.TransactionClient, ctx: Context, input: { organisationId: string; productKey: string }): Promise<Result<{ changed: boolean; slots: number }>> {
  assertProductKey(input.productKey);
  const { organisationId, productKey } = input;
  await lockOrganisation(tx, organisationId);
  const link = await tx.organisationProduct.findUnique({ where: { organisationId_productKey: { organisationId, productKey } }, select: { status: true } });
  if (!link) return { ok: true, changed: false, slots: 0 };
  const links = await tx.organisationProduct.count({ where: { organisationId } });
  if (links <= 1) return refuse(tx, ctx, "product.unlinked", organisationId, "last_link");
  const slots = await tx.membershipProductSlot.findMany({ where: { organisationId, productKey }, select: { slotId: true, userId: true, memberId: true }, orderBy: { allocatedAt: "asc" } });
  await writeAudit(tx, {
    action: "product.unlinked",
    outcome: "done",
    initiator: ctx.initiator,
    executor: ctx.executor,
    organisationId,
    subject: { type: "organisation", id: organisationId },
    before: { productKey, linkStatus: link.status, slotCount: slots.length, memberIds: slots.map((s) => s.memberId) },
    after: {},
    requestId: ctx.requestId,
  });
  const { membershipVersion } = await tx.organisation.update({ where: { id: organisationId }, data: { membershipVersion: { increment: 1 } }, select: { membershipVersion: true } });
  for (const s of slots) await queueMembership(tx, organisationId, { userId: s.userId, status: "removed", membershipVersion: Number(membershipVersion) }, productKey);
  const { outboxSequence } = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { outboxSequence: true } });
  await tx.organisationProductUnlink.create({ data: { organisationId, productKey, organisationSequence: outboxSequence, unlinkedBy: ctx.executor.ref }, select: { id: true } });
  for (const s of slots) await releaseSlot(tx, ctx, { slotId: s.slotId, organisationId, productKey, memberId: s.memberId, cause: "product.unlinked" });
  await tx.organisationProduct.delete({ where: { organisationId_productKey: { organisationId, productKey } }, select: { productKey: true } });
  return { ok: true, changed: true, slots: slots.length };
}

export type LinkState = { state: "linked" } | { state: "unlinked"; unlinkedAt: Date; organisationSequence: bigint } | { state: "never_linked" };

/** The authoritative link state (a current link, else the latest tombstone, else never linked). The signed pull endpoint is not built in W1. */
export async function getLinkState(db: Pick<Prisma.TransactionClient, "organisationProduct" | "organisationProductUnlink">, organisationId: string, productKey: string): Promise<LinkState> {
  const link = await db.organisationProduct.findUnique({ where: { organisationId_productKey: { organisationId, productKey } }, select: { productKey: true } });
  if (link) return { state: "linked" };
  const t = await db.organisationProductUnlink.findFirst({ where: { organisationId, productKey, relinkedAt: null }, orderBy: { unlinkedAt: "desc" }, select: { unlinkedAt: true, organisationSequence: true } });
  return t ? { state: "unlinked", unlinkedAt: t.unlinkedAt, organisationSequence: t.organisationSequence } : { state: "never_linked" };
}

