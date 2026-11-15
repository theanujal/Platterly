import "server-only";
import { parseAccountDeletionIdRequest, parseAccountDeletionRequest } from "@platterly/contract";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { notify } from "@/modules/notifications/notifications";
import { signedCall } from "@/modules/account-reviews/account-reviews";
import { LifecycleError, deleteBusiness, restoreBusiness } from "@/modules/lifecycle/lifecycle";

/**
 * Account deletion requests (AJ, 2026-11-15). The Platform opens a request when a person asks on My Profile; staff approve or decline here; the Platform asks for
 * the decision (so Ops never calls the Platform) and acts on it. Three signed POSTs with the platform-billing secret:
 *   POST /api/platform/account-deletions            opens a request (a repeat of the same requestId changes nothing) and notifies staff
 *   POST /api/platform/account-deletions/status     {requestId} -> {status, declineReason, eraseAfter}
 *   POST /api/platform/account-deletions/withdraw   {requestId}: the person changed their mind while it was still pending
 * Approving suspends the business in every product it uses for the retention period (restorable). The final removal is a later step.
 */
export const RETENTION_DAYS = 30;

export const handleAccountDeletionOpen = (request: Request) =>
  signedCall(request, async (json) => {
    const parsed = parseAccountDeletionRequest(json);
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    const r = parsed.value;
    const made = await prisma.accountDeletionRequest.createMany({
      data: [{ requestId: r.requestId, subject: r.subject, name: r.name, email: r.email.toLowerCase(), phone: r.phone, businessId: r.businessId, businessName: r.businessName, products: r.products, reason: r.reason, requestedAt: new Date(r.requestedAt) }],
      skipDuplicates: true,
    });
    if (made.count > 0) {
      await notify({
        kind: "account.deletion_requested",
        severity: "WARNING",
        title: "An account deletion was requested",
        body: `${r.name || r.email} (${r.email}) asked to delete their Platterly account${r.businessName ? ` and the business ${r.businessName}` : ""}. Nothing is deleted until you approve it.`,
        link: "/account-deletions",
        businessId: r.businessId,
        dedupeKey: `account.deletion:${r.requestId}`,
        emailStaff: true,
      }).catch((error) => console.error("[account-deletions] notification failed", error));
    }
    return { status: 200, body: { requestId: r.requestId, created: made.count > 0 } };
  });

export const handleAccountDeletionStatus = (request: Request) =>
  signedCall(request, async (json) => {
    const parsed = parseAccountDeletionIdRequest(json);
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    const row = await prisma.accountDeletionRequest.findUnique({ where: { requestId: parsed.value.requestId }, select: { status: true, declineReason: true, eraseAfter: true } });
    return row ? { status: 200, body: { requestId: parsed.value.requestId, status: row.status, declineReason: row.declineReason, eraseAfter: row.eraseAfter?.toISOString() ?? null } } : { status: 404, body: { error: "unknown_request" } };
  });

export const handleAccountDeletionWithdraw = (request: Request) =>
  signedCall(request, async (json) => {
    const parsed = parseAccountDeletionIdRequest(json);
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    // Only a request nobody has decided yet can be withdrawn; once staff approved it, they restore it instead.
    const done = await prisma.accountDeletionRequest.updateMany({ where: { requestId: parsed.value.requestId, status: "PENDING" }, data: { status: "WITHDRAWN", decidedAt: new Date() } });
    if (done.count > 0) await audit({ actorUserId: null, action: "account_deletion.withdrawn", subject: parsed.value.requestId });
    const row = await prisma.accountDeletionRequest.findUnique({ where: { requestId: parsed.value.requestId }, select: { status: true } });
    return row ? { status: 200, body: { requestId: parsed.value.requestId, status: row.status } } : { status: 404, body: { error: "unknown_request" } };
  });

export const listAccountDeletions = () => prisma.accountDeletionRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
export const getAccountDeletion = (id: string) => prisma.accountDeletionRequest.findUnique({ where: { id } });
export const countPendingAccountDeletions = () => prisma.accountDeletionRequest.count({ where: { status: "PENDING" } });

async function linkedProducts(businessId: string): Promise<string[]> {
  return (await prisma.businessProduct.findMany({ where: { businessId }, select: { productKey: true } })).map((p) => p.productKey);
}

/**
 * Approve: the business (if there is one) is suspended in every product it uses and stays restorable for the retention period, then the request is marked
 * approved. If a product refuses, nothing is approved and the reason is shown to staff.
 */
export async function approveAccountDeletion(id: string, staffId: string | null, now: Date = new Date()): Promise<void> {
  const row = await prisma.accountDeletionRequest.findUnique({ where: { id } });
  if (!row || row.status !== "PENDING") throw new LifecycleError("This request is no longer pending.");
  if (row.businessId) {
    const business = await prisma.business.findUnique({ where: { id: row.businessId }, select: { name: true, status: true } });
    if (business && business.status !== "PENDING_DELETE") {
      for (const productKey of await linkedProducts(row.businessId)) {
        const result = await deleteBusiness(row.businessId, productKey, business.name, staffId, now);
        if (!result.ok) throw new LifecycleError(`${productKey} did not accept the suspension: ${result.error}`);
      }
    }
  }
  const eraseAfter = new Date(now.getTime() + RETENTION_DAYS * 86_400_000);
  const done = await prisma.accountDeletionRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", decidedAt: now, decidedBy: staffId, eraseAfter } });
  if (done.count === 0) throw new LifecycleError("This request is no longer pending.");
  await audit({ actorUserId: staffId, action: "account_deletion.approved", subject: row.requestId, detail: { businessId: row.businessId, eraseAfter: eraseAfter.toISOString() } });
}

export async function declineAccountDeletion(id: string, reason: string, staffId: string | null, now: Date = new Date()): Promise<void> {
  const text = reason.trim().slice(0, 500);
  if (!text) throw new LifecycleError("Give the person a reason for declining.");
  const row = await prisma.accountDeletionRequest.findUnique({ where: { id }, select: { requestId: true, status: true } });
  if (!row || row.status !== "PENDING") throw new LifecycleError("This request is no longer pending.");
  await prisma.accountDeletionRequest.update({ where: { id }, data: { status: "DECLINED", declineReason: text, decidedAt: now, decidedBy: staffId } });
  await audit({ actorUserId: staffId, action: "account_deletion.declined", subject: row.requestId, detail: { reason: text } });
}

/** Staff change their mind during the retention period: the business is brought back and the person's account is released. */
export async function restoreAccountDeletion(id: string, staffId: string | null): Promise<void> {
  const row = await prisma.accountDeletionRequest.findUnique({ where: { id } });
  if (!row || row.status !== "APPROVED") throw new LifecycleError("Only an approved request can be restored.");
  if (row.businessId) {
    for (const productKey of await linkedProducts(row.businessId)) {
      const result = await restoreBusiness(row.businessId, productKey, staffId);
      if (!result.ok) throw new LifecycleError(`${productKey} did not accept the restore: ${result.error}`);
    }
  }
  await prisma.accountDeletionRequest.update({ where: { id }, data: { status: "RESTORED", decidedAt: new Date(), decidedBy: staffId, eraseAfter: null } });
  await audit({ actorUserId: staffId, action: "account_deletion.restored", subject: row.requestId });
}
