import "server-only";
import type { Buyer, BillingProfileAnswer } from "@platterly/contract";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * A business's saved billing details (F12.2.1). One row per business. Two things write it: a confirmed payment (`settle`, in the payment's own transaction, so an
 * abandoned or failed attempt never touches it) and the Admin's own edit in the Account (`saveBillingProfile`). An invoice keeps its own frozen copy of the
 * details, so neither ever rewrites an invoice that was already issued.
 */
type Db = Prisma.TransactionClient | typeof prisma;
export type ProfileSource = "payment" | "account";

const toBuyer = (row: { name: string; addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null; gstin: string | null; contactName: string | null; contactEmail: string | null; contactPhone: string | null }): Buyer => ({
  name: row.name,
  addressLine1: row.addressLine1,
  addressLine2: row.addressLine2,
  city: row.city,
  state: row.state,
  postalCode: row.postalCode,
  country: row.country,
  gstin: row.gstin,
  contactName: row.contactName,
  contactEmail: row.contactEmail,
  contactPhone: row.contactPhone,
});

/** The saved details, or null for a business that has none yet. */
export async function getSavedBuyer(businessId: string, db: Db = prisma): Promise<Buyer | null> {
  const row = await db.billingCustomer.findUnique({ where: { businessId } });
  return row ? toBuyer(row) : null;
}

/** What the Platform reads: the saved details and when they last changed. Null when the business does not exist. */
export async function getBillingProfile(businessId: string): Promise<BillingProfileAnswer | null> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } });
  if (!business) return null;
  const row = await prisma.billingCustomer.findUnique({ where: { businessId } });
  return { profile: row ? toBuyer(row) : null, updatedAt: row ? row.updatedAt.toISOString() : null };
}

/** A payment's buyer carries no contact, so it keeps the contact already saved; only the Account's own edit sets or clears it. */
const contactData = (buyer: Buyer, existing: { contactName: string | null; contactEmail: string | null; contactPhone: string | null } | null) =>
  buyer.contactName === undefined && buyer.contactEmail === undefined && buyer.contactPhone === undefined
    ? { contactName: existing?.contactName ?? null, contactEmail: existing?.contactEmail ?? null, contactPhone: existing?.contactPhone ?? null }
    : { contactName: buyer.contactName ?? null, contactEmail: buyer.contactEmail ?? null, contactPhone: buyer.contactPhone ?? null };

/**
 * Saves the details. A write that changes nothing leaves the row (and its time) alone, so confirming the same payment twice, or a renewal that carries the saved
 * details forward, does not look like an edit. Returns false when the business does not exist.
 */
export async function saveBillingProfile(businessId: string, buyer: Buyer, source: ProfileSource, db: Db = prisma): Promise<boolean> {
  const business = await db.business.findUnique({ where: { id: businessId }, select: { id: true } });
  if (!business) return false;
  const existing = await db.billingCustomer.findUnique({ where: { businessId } });
  if (existing && JSON.stringify(toBuyer(existing)) === JSON.stringify({ ...buyer, ...contactData(buyer, existing) })) return true;
  const data = { name: buyer.name, addressLine1: buyer.addressLine1, addressLine2: buyer.addressLine2, city: buyer.city, state: buyer.state, postalCode: buyer.postalCode, country: buyer.country, gstin: buyer.gstin, source, ...contactData(buyer, existing) };
  await db.billingCustomer.upsert({ where: { businessId }, create: { businessId, ...data }, update: data });
  return true;
}
