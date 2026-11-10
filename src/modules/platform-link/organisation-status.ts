import "server-only";
import type { OrganisationStatusData } from "@platterly/platform-contract";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit/audit";

type Tx = Pick<Prisma.TransactionClient, "organization" | "auditLog">;

export type OrganisationStatusResult =
  | { ok: true; changedTo: "SUSPENDED" | "ACTIVE" | null }
  | { ok: false; status: 409; error: "business_not_linked" };

/**
 * `organisation.status`, applied inside the event's transaction.
 *  - suspended / closed: an ACTIVE business becomes SUSPENDED and is marked `suspendedBy = platform`. A business that is already suspended (Ops, billing
 *    lock, delete request) is left exactly as it is. `closed` is never DEACTIVATED and nothing is deleted.
 *  - active: lifts a suspension ONLY if the Platform placed it, so an Ops suspension is never undone from here.
 *  - a DEACTIVATED business is never touched.
 * `changedTo` tells the caller whether to notify the team (after the transaction commits).
 */
export async function applyOrganisationStatus(tx: Tx, businessId: string, data: OrganisationStatusData): Promise<OrganisationStatusResult> {
  const org = await tx.organization.findUnique({ where: { businessId }, select: { id: true, status: true, suspendedBy: true } });
  if (!org) return { ok: false, status: 409, error: "business_not_linked" };
  if (org.status === "DEACTIVATED") return { ok: true, changedTo: null };

  if (data.status === "active") {
    if (org.status !== "SUSPENDED" || org.suspendedBy !== "platform") return { ok: true, changedTo: null };
    await tx.organization.update({ where: { id: org.id }, data: { status: "ACTIVE", suspendedBy: null } });
    await audit({ organizationId: org.id, action: "tenant.activate", recordType: "Organization", recordId: org.id, before: { status: "SUSPENDED" }, after: { status: "ACTIVE" } }, tx as Prisma.TransactionClient);
    return { ok: true, changedTo: "ACTIVE" };
  }

  if (org.status !== "ACTIVE") return { ok: true, changedTo: null };
  await tx.organization.update({ where: { id: org.id }, data: { status: "SUSPENDED", suspendedBy: "platform" } });
  await audit({ organizationId: org.id, action: "tenant.suspend", recordType: "Organization", recordId: org.id, before: { status: "ACTIVE" }, after: { status: "SUSPENDED", platformStatus: data.status } }, tx as Prisma.TransactionClient);
  return { ok: true, changedTo: "SUSPENDED" };
}
