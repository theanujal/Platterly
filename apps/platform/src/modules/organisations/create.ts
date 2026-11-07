import { createHash, randomBytes } from "node:crypto";
import { isId } from "@platterly/contract";
import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "../audit/write-audit";
import { getUserStanding } from "../users/standing";
import { swapAdminRows, isRefusal, isAdminElsewhere } from "./admin";
import { InvalidInputError, assertProductKey, type Context, type Result } from "./errors";
import { lockOrganisation } from "./lock";
import { allocateSlot, slotsTakenElsewhere } from "./slots";
import { queueMembership, refuse } from "./support";

// F3.2.2 organisation creation (O1) and adoption (docs/w1-implementation-plan.md, F3.2.2 and the single-Admin proposal, S1 and S2).
export const mintOrganisationId = () => `biz_${randomBytes(16).toString("hex")}`;
const normaliseName = (name: string) => name.trim().replace(/\s+/g, " ");
const requestHash = (name: string, productKey: string) => createHash("sha256").update(JSON.stringify({ name: normaliseName(name).toLowerCase(), productKey })).digest("hex");

function checkName(name: string) {
  const n = normaliseName(name);
  if (n.length === 0 || n.length > 120) throw new InvalidInputError("a business name is 1 to 120 characters");
  return n;
}

/** `organisationId` adopts an existing business id (a Caterly `businessId`, so Platform and Ops agree on one id); without it a new one is minted. */
export type CreateOrganisationInput = { userId: string; idempotencyKey: string; name: string; productKey: string; organisationId?: string };
export type CreatedOrganisation = { organisationId: string; created: boolean };

/**
 * O1, one transaction (the caller's): verify the creator, then organisation, product link, the creator as first Admin (the database sets
 * `admin_established`), the creator's slot, one audit row and the outbox events. The same idempotency key returns the stored organisation (a
 * different request is refused); a person who already holds a slot for the product elsewhere is refused.
 */
export async function createOrganisation(tx: Prisma.TransactionClient, ctx: Context, input: CreateOrganisationInput): Promise<Result<CreatedOrganisation>> {
  const name = checkName(input.name);
  assertProductKey(input.productKey);
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 100) throw new InvalidInputError("an idempotency key is 8 to 100 characters");
  const hash = requestHash(name, input.productKey);
  const action = "organisation.created";

  const user = await getUserStanding(tx, input.userId);
  if (!user) return refuse(tx, ctx, action, null, "user_not_found");
  if (user.status !== "active") return refuse(tx, ctx, action, null, "user_not_active");
  if (!user.emailVerified) return refuse(tx, ctx, action, null, "email_not_verified");

  const replay = async (): Promise<Result<CreatedOrganisation> | null> => {
    const stored = await tx.organisationCreationRequest.findUnique({ where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } }, select: { requestHash: true, organisationId: true } });
    if (!stored) return null;
    if (stored.requestHash !== hash) return refuse(tx, ctx, action, null, "idempotency_conflict");
    return { ok: true, organisationId: stored.organisationId, created: false };
  };
  const earlier = await replay();
  if (earlier) return earlier;

  if (await isAdminElsewhere(tx, input.userId)) return refuse(tx, ctx, action, null, "already_admin_elsewhere");
  if ((await slotsTakenElsewhere(tx, "", input.productKey, [input.userId])) > 0) return refuse(tx, ctx, action, null, "slot_taken", { people: 1 });

  if (input.organisationId !== undefined && !isId("business", input.organisationId)) throw new InvalidInputError("an adopted business id must look like biz_ followed by 32 hex characters");
  const organisationId = input.organisationId ?? mintOrganisationId();
  await tx.organisation.create({ data: { id: organisationId, name }, select: { id: true } });
  await lockOrganisation(tx, organisationId);
  // Claim the idempotency key. A concurrent request with the same key waits here on the first one's uncommitted row; if that commits, this
  // insert does nothing and the stored organisation is returned instead (our own organisation row is removed again, nothing else exists yet).
  const claimed = await tx.$queryRaw<{ id: string }[]>`
    insert into organisation_creation_requests (user_id, idempotency_key, request_hash, organisation_id)
    values (${input.userId}::uuid, ${input.idempotencyKey}, ${hash}, ${organisationId})
    on conflict (user_id, idempotency_key) do nothing returning id`;
  if (claimed.length === 0) {
    await tx.organisation.delete({ where: { id: organisationId }, select: { id: true } });
    const winner = await replay();
    if (winner) return winner;
    throw new Error("the idempotency key conflicted but no stored request was found");
  }

  await tx.organisationProduct.create({ data: { organisationId, productKey: input.productKey }, select: { productKey: true } });
  const swap = await swapAdminRows(tx, organisationId, null, input.userId);
  if (isRefusal(swap)) throw new Error(`a new business refused its first Admin: ${swap.refused}`);
  await allocateSlot(tx, ctx, { organisationId, productKey: input.productKey, memberId: swap.current.memberId, userId: input.userId, cause: "organisation.created" });
  const { membershipVersion } = await tx.organisation.update({ where: { id: organisationId }, data: { membershipVersion: { increment: 1 } }, select: { membershipVersion: true } });
  await writeAudit(tx, {
    action,
    outcome: "done",
    initiator: ctx.initiator,
    executor: ctx.executor,
    organisationId,
    subject: { type: "organisation", id: organisationId },
    after: { name, productKey: input.productKey, adminMemberId: swap.current.memberId },
    requestId: ctx.requestId,
  });
  await queueMembership(tx, organisationId, { userId: input.userId, status: "active", membershipVersion: Number(membershipVersion) });
  return { ok: true, organisationId, created: true };
}

export type AdoptOrganisationInput = { name: string; importBatchId?: string };

/** An unclaimed business (P1): no Admin, no link, `admin_established` false. It becomes established only through a real first Admin. */
export async function adoptOrganisation(tx: Prisma.TransactionClient, ctx: Context, input: AdoptOrganisationInput): Promise<Result<{ organisationId: string }>> {
  const name = checkName(input.name);
  if (input.importBatchId !== undefined && input.importBatchId.trim() === "") throw new InvalidInputError("an import batch id cannot be blank");
  const organisationId = mintOrganisationId();
  await tx.organisation.create({ data: { id: organisationId, name, importBatchId: input.importBatchId ?? null }, select: { id: true } });
  await lockOrganisation(tx, organisationId);
  await writeAudit(tx, {
    action: "organisation.adopted",
    outcome: "done",
    initiator: ctx.initiator,
    executor: ctx.executor,
    organisationId,
    subject: { type: "organisation", id: organisationId },
    after: { name, importBatchId: input.importBatchId ?? null },
    requestId: ctx.requestId,
  });
  return { ok: true, organisationId };
}
