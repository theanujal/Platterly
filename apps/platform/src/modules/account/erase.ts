import { rm } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "../audit/write-audit";
import { releaseSlot } from "../organisations/slots";
import { deleteLogo, logoDir, logoKeyFromUrl } from "./business-logo";
import { photoDir } from "./photo";

/**
 * Permanent erasure, Platform side (AJ, 2026-11-16). Ops tells the Platform when staff pressed "Erase now" on an approved deletion (the Platform asks, so Ops never
 * calls it). Then, for that person:
 *   identity   the person and everything that hangs off them (sessions, sign-in accounts and history, devices, recovery email, two-step, photo, profile, deletion
 *              request, notification choices), the emailed codes still waiting for their address, and the photo file;
 *   central    the business (organisation, its team roster, product links, ownership transfers) and the Platform's own record of the person and their identity link;
 *   files      the logo files this Platform hosts for the business.
 * The Platform's audit log is append-only by design and stays (it holds ids and decisions, not contact details). One receipt row, with no personal details, remembers
 * that the erase is done until Ops has been told.
 */
export type PlatformEraser = (identitySubject: string, businessId: string | null) => Promise<void>;

/**
 * Removes the Platform's central records for one person and their business, inside the caller's transaction. The database refuses to delete an organisation
 * that still holds product slots, so each slot is released first with its history event (the same step an unlink takes); the organisation then takes its
 * members, product links, team roster and transfers with it, which is what lets the person's own rows be deleted after. One audit row says the business was erased.
 */
export async function erasePlatformRecords(tx: Prisma.TransactionClient, identitySubject: string, businessId: string | null): Promise<void> {
  const ctx = { initiator: { kind: "system" as const, ref: "erase" }, executor: { kind: "system" as const, ref: "erase" } };
  if (businessId) {
    for (const slot of await tx.membershipProductSlot.findMany({ where: { organisationId: businessId } })) {
      await releaseSlot(tx, ctx, { slotId: slot.slotId, organisationId: businessId, productKey: slot.productKey, memberId: slot.memberId, cause: "erased" });
    }
    await tx.$executeRaw`delete from organisations where id = ${businessId}`;
    await writeAudit(tx, { action: "organisation.erased", outcome: "done", initiator: ctx.initiator, executor: ctx.executor, organisationId: businessId, subject: { type: "organisation", id: businessId }, requestId: undefined });
  }
  const people = await tx.$queryRaw<{ user_id: string }[]>`select user_id from user_identities where subject = ${identitySubject}`;
  for (const { user_id } of people) {
    await tx.$executeRaw`delete from legacy_mappings where user_id = ${user_id}::uuid`;
    await tx.$executeRaw`delete from user_identities where user_id = ${user_id}::uuid`;
    await tx.$executeRaw`delete from users where id = ${user_id}::uuid`;
  }
}

/** Erases one approved request's person. Safe to run again: it does nothing for a person already gone. Returns false when there was nobody to erase. */
export async function eraseAccount(pool: Pool, input: { requestId: string; userId: string; businessId: string | null; logoUrls: string[] }, eraser?: PlatformEraser, dirs: { photos?: string; logos?: string } = {}): Promise<boolean> {
  const { rows } = await pool.query(`select u."email", p."photoKey" from "user" u left join "accountProfile" p on p."userId" = u."id" where u."id" = $1`, [input.userId]);
  if (!rows[0]) return false;
  const { email, photoKey } = rows[0] as { email: string; photoKey: string | null };
  // Logo files this person uploaded, saved or not: read before the person's rows go.
  const uploaded = (await pool.query(`select "key" from "accountLogoUpload" where "userId" = $1`, [input.userId])).rows.map((r: { key: string }) => r.key);
  const erasePlatform: PlatformEraser = eraser ?? (async (subject, businessId) => {
    const { prisma } = await import("@/lib/db");
    await prisma.$transaction((tx) => erasePlatformRecords(tx, subject, businessId), { timeout: 30_000 });
  });

  // Central records first: if this fails nothing in the identity database has changed and the next pass tries again.
  await erasePlatform(input.userId, input.businessId);

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`insert into "erasureReceipt" ("requestId") values ($1) on conflict do nothing`, [input.requestId]);
    await client.query(`delete from "verification" where lower("identifier") like '%' || lower($1) || '%'`, [email]);
    await client.query(`delete from "user" where "id" = $1`, [input.userId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  if (photoKey) await rm(path.join(dirs.photos ?? photoDir(), path.basename(photoKey)), { force: true });
  for (const url of input.logoUrls) {
    const key = logoKeyFromUrl(url);
    if (key) await rm(path.join(dirs.logos ?? logoDir(), key), { force: true });
  }
  for (const key of uploaded) await deleteLogo(key, dirs.logos ?? logoDir());
  return true;
}
