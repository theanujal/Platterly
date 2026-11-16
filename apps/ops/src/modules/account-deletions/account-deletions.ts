import "server-only";
import { parseAccountDeletionIdRequest, parseAccountDeletionRequest } from "@platterly/contract";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { notifySafely } from "@/modules/notifications/notifications";
import { signedCall } from "@/modules/account-reviews/account-reviews";
import { deleteRazorpayToken, platformRazorpay, updateRazorpayCustomer } from "@/modules/billing/razorpay";
import { LifecycleError, deleteBusiness, restoreBusiness, runCommand } from "@/modules/lifecycle/lifecycle";

/**
 * Account deletion requests (AJ, 2026-11-15). The Platform opens a request when a person asks on My Profile; staff approve or decline here; the Platform asks for
 * the decision (so Ops never calls the Platform) and acts on it. Three signed POSTs with the platform-billing secret:
 *   POST /api/platform/account-deletions            opens a request (a repeat of the same requestId changes nothing) and notifies staff
 *   POST /api/platform/account-deletions/status     {requestId} -> {status, declineReason, eraseAfter}
 *   POST /api/platform/account-deletions/withdraw   {requestId}: the person changed their mind while it was still pending
 * Approving suspends the business in every product it uses for the retention period (restorable). The final removal is the staff "Erase now" step
 * (`requestAccountErasure`): the products erase the business, Ops anonymises its own records, and the Platform (which asks for the status, so Ops never calls it)
 * erases the person and reports back on `/api/platform/account-deletions/erased`.
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
      await notifySafely({
        kind: "account.deletion_requested",
        severity: "WARNING",
        title: "An account deletion was requested",
        body: `${r.name || r.email} (${r.email}) asked to delete their Platterly account${r.businessName ? ` and the business ${r.businessName}` : ""}. Nothing is deleted until you approve it.`,
        link: "/account-deletions",
        businessId: r.businessId,
        dedupeKey: `account.deletion:${r.requestId}`,
        emailStaff: true,
      });
    }
    return { status: 200, body: { requestId: r.requestId, created: made.count > 0 } };
  });

export const handleAccountDeletionStatus = (request: Request) =>
  signedCall(request, async (json) => {
    const parsed = parseAccountDeletionIdRequest(json);
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    const row = await prisma.accountDeletionRequest.findUnique({ where: { requestId: parsed.value.requestId }, select: { status: true, declineReason: true, eraseAfter: true, eraseRequestedAt: true, eraseLogoUrls: true } });
    return row ? { status: 200, body: { requestId: parsed.value.requestId, status: row.status === "APPROVING" ? "PENDING" : row.status, declineReason: row.declineReason, eraseAfter: row.eraseAfter?.toISOString() ?? null, eraseRequested: row.eraseRequestedAt !== null, logoUrls: row.eraseRequestedAt && Array.isArray(row.eraseLogoUrls) ? row.eraseLogoUrls : [] } } : { status: 404, body: { error: "unknown_request" } };
  });

export const handleAccountDeletionWithdraw = (request: Request) =>
  signedCall(request, async (json) => {
    const parsed = parseAccountDeletionIdRequest(json);
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    // Only a request nobody has decided yet can be withdrawn; once staff approved it, they restore it instead.
    const done = await prisma.accountDeletionRequest.updateMany({ where: { requestId: parsed.value.requestId, status: "PENDING" }, data: { status: "WITHDRAWN", decidedAt: new Date() } });
    if (done.count > 0) await audit({ actorUserId: null, action: "account_deletion.withdrawn", subject: parsed.value.requestId });
    const row = await prisma.accountDeletionRequest.findUnique({ where: { requestId: parsed.value.requestId }, select: { status: true } });
    return row ? { status: 200, body: { requestId: parsed.value.requestId, status: row.status === "APPROVING" ? "PENDING" : row.status } } : { status: 404, body: { error: "unknown_request" } };
  });

export const listAccountDeletions = () => prisma.accountDeletionRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
export const getAccountDeletion = (id: string) => prisma.accountDeletionRequest.findUnique({ where: { id } });
export const countPendingAccountDeletions = () => prisma.accountDeletionRequest.count({ where: { status: "PENDING" } });

async function linkedProducts(businessId: string): Promise<string[]> {
  return (await prisma.businessProduct.findMany({ where: { businessId }, select: { productKey: true } })).map((p) => p.productKey);
}

/** An APPROVING claim older than this is treated as abandoned (Ops restarted or crashed mid-approve): staff can claim it again or decline it. */
export const APPROVING_STALE_MS = 5 * 60_000;
export const isStaleApproving = (row: { status: string; decidedAt: Date | null }, now: Date = new Date()) =>
  row.status === "APPROVING" && (!row.decidedAt || now.getTime() - row.decidedAt.getTime() > APPROVING_STALE_MS);

/** Brings the business back in the given products (best effort, returns the products that refused). */
async function restoreProducts(businessId: string, productKeys: string[], staffId: string | null, fetchImpl?: typeof fetch): Promise<string[]> {
  const failed: string[] = [];
  for (const productKey of productKeys) {
    try {
      const result = await restoreBusiness(businessId, productKey, staffId, fetchImpl);
      if (!result.ok) failed.push(productKey);
    } catch { failed.push(productKey); }
  }
  return failed;
}

/**
 * Approve: the request is claimed first (PENDING to APPROVING, with the claim time in `decidedAt`; a withdrawal refuses it, and a claim older than
 * APPROVING_STALE_MS is taken over so a crash never strands it), then the business (if there is one) is suspended in every product it uses and stays restorable for
 * the retention period, then the request is marked approved. If a product refuses, the products suspended in this try are restored, the request goes back to PENDING
 * and the reason is shown to staff. Every product is told on every try (suspending an already suspended business is harmless). A business that was already
 * suspended keeps its original restore date, so a retry never pushes it out again.
 */
export async function approveAccountDeletion(id: string, staffId: string | null, now: Date = new Date(), fetchImpl?: typeof fetch): Promise<void> {
  const staleBefore = new Date(now.getTime() - APPROVING_STALE_MS);
  const claimed = await prisma.accountDeletionRequest.updateMany({
    where: { id, OR: [{ status: "PENDING" }, { status: "APPROVING", OR: [{ decidedAt: null }, { decidedAt: { lt: staleBefore } }] }] },
    data: { status: "APPROVING", decidedAt: now },
  });
  if (claimed.count === 0) throw new LifecycleError("This request is no longer pending.");
  const row = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id } });
  let eraseAfter = new Date(now.getTime() + RETENTION_DAYS * 86_400_000);
  const suspendedNow: string[] = [];
  let before: { status: string; deleteAfter: Date | null } | null = null;
  // What the business was before the FIRST try of this request (a cut-off earlier try may already have suspended it). Saved before any product is told anything.
  const reclaimed = row.priorBusinessStatus !== null;
  let prior: string | null = row.priorBusinessStatus;
  try {
    if (row.businessId) {
      const business = await prisma.business.findUnique({ where: { id: row.businessId }, select: { name: true, status: true, deleteAfter: true } });
      if (business) {
        before = business;
        if (!prior) {
          prior = business.status;
          await prisma.accountDeletionRequest.update({ where: { id }, data: { priorBusinessStatus: prior } });
        }
        for (const productKey of await linkedProducts(row.businessId)) {
          const result = await deleteBusiness(row.businessId, productKey, business.name, staffId, now, fetchImpl);
          if (!result.ok) throw new LifecycleError(`${productKey} did not accept the suspension: ${result.error}`);
          suspendedNow.push(productKey);
        }
        // Already suspended before this try (an earlier attempt that was cut off): keep that restore date instead of moving it out again.
        if (business.status === "PENDING_DELETE" && business.deleteAfter) {
          eraseAfter = business.deleteAfter;
          await prisma.business.update({ where: { id: row.businessId }, data: { deleteAfter: business.deleteAfter } });
        }
      }
    }
    await prisma.accountDeletionRequest.update({ where: { id }, data: { status: "APPROVED", decidedAt: now, decidedBy: staffId, eraseAfter } });
  } catch (error) {
    // Undo only what this request suspended: the business must have been ACTIVE before the request's first try. One that was suspended for another reason
    // (staff, non-payment) or already pending deletion is left exactly as it was, because a restore would reactivate it.
    let note = "";
    let rolledBack = false;
    if (row.businessId && prior === "ACTIVE") {
      const targets = reclaimed ? await linkedProducts(row.businessId) : suspendedNow;
      const failed = await restoreProducts(row.businessId, targets, staffId, fetchImpl);
      if (failed.length > 0) note = ` The business is still suspended in ${failed.join(", ")}; restore it there by hand.`;
      else rolledBack = true;
    } else if (row.businessId && before?.status === "PENDING_DELETE") {
      // Put its restore date back, since each suspension call moved it.
      await prisma.business.update({ where: { id: row.businessId }, data: { deleteAfter: before.deleteAfter } }).catch(() => undefined);
    } else if (row.businessId && prior === "SUSPENDED") {
      // The products stay suspended (a deletion request is a suspension to them), but Ops's own label must go back from "Marked for deletion" to "Suspended".
      await prisma.business.update({ where: { id: row.businessId }, data: { status: "SUSPENDED", deleteAfter: null } }).catch(() => undefined);
    }
    await prisma.accountDeletionRequest.updateMany({ where: { id, status: "APPROVING" }, data: { status: "PENDING", decidedAt: null, ...(rolledBack ? { priorBusinessStatus: null } : {}) } });
    throw note && error instanceof Error ? new LifecycleError(`${error.message}${note}`) : error;
  }
  await audit({ actorUserId: staffId, action: "account_deletion.approved", subject: row.requestId, detail: { businessId: row.businessId, eraseAfter: eraseAfter.toISOString() } });
}

/**
 * Decline a pending request. A stale APPROVING one (the approve was cut off) can be declined too: if the business was ACTIVE before the request started it may be
 * half suspended, so it is restored first (a business that was suspended for another reason is left alone); if a product refuses, the request stays as it is and
 * staff are told which one.
 */
export async function declineAccountDeletion(id: string, reason: string, staffId: string | null, now: Date = new Date(), fetchImpl?: typeof fetch): Promise<void> {
  const text = reason.trim().slice(0, 500);
  if (!text) throw new LifecycleError("Give the person a reason for declining.");
  const row = await prisma.accountDeletionRequest.findUnique({ where: { id }, select: { requestId: true, status: true, decidedAt: true, businessId: true, priorBusinessStatus: true } });
  if (!row || (row.status !== "PENDING" && !isStaleApproving(row, now))) throw new LifecycleError("This request is no longer pending.");
  // Only what this request suspended comes back: a business that was not ACTIVE when the request started stays as it was.
  if (row.status === "APPROVING" && row.businessId && row.priorBusinessStatus === "ACTIVE") {
    const failed = await restoreProducts(row.businessId, await linkedProducts(row.businessId), staffId, fetchImpl);
    if (failed.length > 0) throw new LifecycleError(`${failed.join(", ")} did not accept the restore, so the request was not declined. Try again.`);
  }
  const done = await prisma.accountDeletionRequest.updateMany({ where: { id, status: row.status }, data: { status: "DECLINED", declineReason: text, decidedAt: now, decidedBy: staffId } });
  if (done.count === 0) throw new LifecycleError("This request is no longer pending.");
  await audit({ actorUserId: staffId, action: "account_deletion.declined", subject: row.requestId, detail: { reason: text } });
}

/**
 * Staff change their mind during the retention period: the business is brought back and the person's account is released. Only a business that was ACTIVE when the
 * request was approved is reactivated. One that was suspended for another reason stays suspended (the products already hold it suspended, so only Ops's label goes
 * back to "Suspended"), and one that was already marked for deletion before the request stays marked, with its own restore date. Requests approved before the status
 * was saved (null) are treated as ACTIVE.
 */
export async function restoreAccountDeletion(id: string, staffId: string | null, fetchImpl?: typeof fetch): Promise<void> {
  const row = await prisma.accountDeletionRequest.findUnique({ where: { id } });
  if (!row || row.status !== "APPROVED") throw new LifecycleError("Only an approved request can be restored.");
  if (row.businessId) {
    if (row.priorBusinessStatus === "SUSPENDED") {
      await prisma.business.update({ where: { id: row.businessId }, data: { status: "SUSPENDED", deleteAfter: null } });
    } else if (row.priorBusinessStatus !== "PENDING_DELETE") {
      for (const productKey of await linkedProducts(row.businessId)) {
        const result = await restoreBusiness(row.businessId, productKey, staffId, fetchImpl);
        if (!result.ok) throw new LifecycleError(`${productKey} did not accept the restore: ${result.error}`);
      }
    }
  }
  await prisma.accountDeletionRequest.update({ where: { id }, data: { status: "RESTORED", decidedAt: new Date(), decidedBy: staffId, eraseAfter: null } });
  await audit({ actorUserId: staffId, action: "account_deletion.restored", subject: row.requestId });
}

const CONTACT_KEYS = ["contactName", "contactEmail", "contactPhone", "email", "phone"];
// jsonb minus each personal key; the legal name, address and GSTIN of an invoice stay, because a tax invoice must keep who it was issued to.
const stripContact = (column: string) => CONTACT_KEYS.reduce((expr, key) => `${expr} - '${key}'`, column);

/**
 * Ops's own records for an erased business: the people are removed, the money records stay. Owner name, email and phone, the billing profiles, the saved payment
 * methods and the Razorpay customer link go; invoices and payments keep their numbers, amounts and the buyer's legal name, address and GSTIN but lose the
 * contact person's name, email and phone; message logs lose the address they went to. One transaction.
 */
export async function anonymiseBusinessRecords(businessId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Printed-stand orders keep their numbers, amounts and invoice (legal buyer name, address, GSTIN); the delivery address, contact person and logo go.
    await tx.$executeRawUnsafe(`UPDATE "stand_order" SET "shipTo" = '{"erased":true}'::jsonb, "buyer" = ${stripContact('"buyer"')}, "invoiceSnapshot" = CASE WHEN "invoiceSnapshot" ? 'buyer' THEN jsonb_set("invoiceSnapshot", '{buyer}', ${stripContact(`("invoiceSnapshot"->'buyer')`)}) ELSE "invoiceSnapshot" END, "kitchenLogoUrl" = NULL, "trackingNote" = NULL WHERE "businessId" = $1`, businessId);
    await tx.productBillingProfile.deleteMany({ where: { businessId } });
    await tx.paymentMethod.deleteMany({ where: { businessId } });
    await tx.razorpayCustomer.deleteMany({ where: { businessId } });
    await tx.messageLog.updateMany({ where: { businessId }, data: { toEmail: null } });
    await tx.$executeRawUnsafe(`UPDATE "subscription_payment" SET "buyer" = ${stripContact('"buyer"')}, "invoiceSnapshot" = CASE WHEN "invoiceSnapshot" ? 'buyer' THEN jsonb_set("invoiceSnapshot", '{buyer}', ${stripContact(`("invoiceSnapshot"->'buyer')`)}) ELSE "invoiceSnapshot" END WHERE "businessId" = $1`, businessId);
    await tx.business.update({ where: { id: businessId }, data: { name: `Erased business ${businessId.slice(-6)}`, ownerName: null, ownerEmail: null, ownerPhone: null } });
  });
}

const isNotFound = (error: unknown) => error instanceof Error && /\(404\)/.test(error.message);

/**
 * Razorpay holds a customer record and saved tokens for the business. Razorpay has no way to delete a customer, so the saved cards and UPI ids are deleted and the customer
 * is overwritten with placeholders. Runs before anything else is erased: a Razorpay outage stops the erase with nothing changed. Skipped when Razorpay is not configured.
 */
export async function scrubRazorpayCustomer(businessId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const creds = platformRazorpay();
  const customer = await prisma.razorpayCustomer.findUnique({ where: { businessId } });
  if (!creds || !customer) return;
  const tokens = await prisma.paymentMethod.findMany({ where: { businessId, razorpayTokenId: { not: null } }, select: { razorpayTokenId: true } });
  for (const t of tokens) {
    try { await deleteRazorpayToken(creds, customer.customerId, t.razorpayTokenId!, fetchImpl); } catch (error) { if (!isNotFound(error)) throw error; }
  }
  const tag = businessId.slice(-6).toLowerCase();
  try { await updateRazorpayCustomer(creds, customer.customerId, { name: `Erased business ${tag}`, email: `erased-${tag}@erased.invalid`, contact: "9999999999" }, fetchImpl); } catch (error) { if (!isNotFound(error)) throw error; }
}

/**
 * Staff press "Erase now" on an approved request. Irreversible. The typed confirmation is the person's email. Every product is told to erase the business (a
 * product that refuses stops it, nothing else is touched), then Ops anonymises its own records and marks the request so the Platform erases the person and
 * the central records when it next asks. A person with no business skips the product and Ops steps.
 */
export async function requestAccountErasure(id: string, confirmation: string, staffId: string | null, now: Date = new Date(), fetchImpl?: typeof fetch): Promise<void> {
  const row = await prisma.accountDeletionRequest.findUnique({ where: { id } });
  if (!row || row.status !== "APPROVED") throw new LifecycleError("Only an approved request can be erased.");
  if (row.eraseRequestedAt) throw new LifecycleError("The erase was already started.");
  if (confirmation.trim().toLowerCase() !== row.email.toLowerCase()) throw new LifecycleError("Type the person's email exactly to confirm.");
  let logoUrls: string[] = [];
  if (row.businessId) {
    const undelivered = await prisma.standOrder.count({ where: { businessId: row.businessId, paymentStatus: "PAID", fulfilment: { not: "DELIVERED" } } });
    if (undelivered > 0) throw new LifecycleError("A paid printed-stand order has not been delivered yet. Deliver or cancel it first, because erasing removes its delivery address.");
    await scrubRazorpayCustomer(row.businessId, fetchImpl);
    const business = await prisma.business.findUnique({ where: { id: row.businessId }, select: { name: true } });
    if (business) {
      logoUrls = (await prisma.productBillingProfile.findMany({ where: { businessId: row.businessId, logoUrl: { not: null } }, select: { logoUrl: true } })).map((p) => p.logoUrl!);
      for (const productKey of await linkedProducts(row.businessId)) {
        const result = await runCommand({ productKey, dedupeKey: `erase:${row.businessId}:${productKey}`, command: { type: "business.erase", businessId: row.businessId, payload: { confirmation: row.businessId! } } }, fetchImpl);
        if (!result.ok) throw new LifecycleError(`${productKey} did not accept the erase: ${result.error}`);
      }
      await anonymiseBusinessRecords(row.businessId);
    }
  }
  await prisma.accountDeletionRequest.update({ where: { id }, data: { eraseRequestedAt: now, eraseLogoUrls: logoUrls } });
  await audit({ actorUserId: staffId, action: "account_deletion.erase_requested", subject: row.requestId, detail: { businessId: row.businessId } });
}

/** The Platform reports that the person and the central records are gone: the request closes as ERASED and its own personal details are wiped. */
export const handleAccountDeletionErased = (request: Request) =>
  signedCall(request, async (json) => {
    const parsed = parseAccountDeletionIdRequest(json);
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    const row = await prisma.accountDeletionRequest.findUnique({ where: { requestId: parsed.value.requestId }, select: { status: true, eraseRequestedAt: true } });
    if (!row) return { status: 404, body: { error: "unknown_request" } };
    if (!row.eraseRequestedAt) return { status: 409, body: { error: "erase_not_requested" } };
    if (row.status !== "ERASED") {
      await prisma.accountDeletionRequest.update({ where: { requestId: parsed.value.requestId }, data: { status: "ERASED", erasedAt: new Date(), name: "Erased", email: "erased", phone: "", reason: "", businessName: null, eraseLogoUrls: Prisma.DbNull } });
      await audit({ actorUserId: null, action: "account_deletion.erased", subject: parsed.value.requestId });
    }
    return { status: 200, body: { requestId: parsed.value.requestId, status: "ERASED" } };
  });
