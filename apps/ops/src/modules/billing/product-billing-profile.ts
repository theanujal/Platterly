import "server-only";
import type { Buyer, ProductBillingProfileChange } from "@platterly/contract";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * One billing profile per business and product. The Account's Billing Profiles page and the product's own Business Profile edit this same record. Every save
 * names the version it was based on; a stale one is refused and the current record comes back, so two screens never silently overwrite each other.
 * Issued invoices keep their own frozen copy of the buyer and are never touched here.
 */
export const PROFILE_FIELDS = ["name", "brandName", "contactName", "contactEmail", "contactPhone", "addressLine1", "addressLine2", "city", "state", "postalCode", "country", "gstin", "description", "website", "instagram", "facebook", "linkedin", "businessPhone", "orderNumberPrefix", "orderNumberNextValue", "orderNumberPadding", "logoUrl"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileFields = { name: string } & Partial<Record<Exclude<ProfileField, "name">, string | null>>;
export type ProductBillingProfile = { businessId: string; productKey: string; version: number; source: string; updatedAt: string } & { name: string } & Record<Exclude<ProfileField, "name">, string | null>;
export type SaveResult = { ok: true; profile: ProductBillingProfile } | { ok: false; reason: "conflict"; current: ProductBillingProfile | null } | { ok: false; reason: "not_found" };

type Row = Awaited<ReturnType<typeof prisma.productBillingProfile.findUniqueOrThrow>>;
const toProfile = (r: Row): ProductBillingProfile => ({
  businessId: r.businessId, productKey: r.productKey, version: r.version, source: r.source, updatedAt: r.updatedAt.toISOString(),
  name: r.name, brandName: r.brandName, contactName: r.contactName, contactEmail: r.contactEmail, contactPhone: r.contactPhone,
  addressLine1: r.addressLine1, addressLine2: r.addressLine2, city: r.city, state: r.state, postalCode: r.postalCode, country: r.country,
  gstin: r.gstin, description: r.description, website: r.website, instagram: r.instagram, facebook: r.facebook, linkedin: r.linkedin, businessPhone: r.businessPhone,
  orderNumberPrefix: r.orderNumberPrefix, orderNumberNextValue: r.orderNumberNextValue, orderNumberPadding: r.orderNumberPadding, logoUrl: r.logoUrl,
});
const clean = (f: ProfileFields): Record<ProfileField, string | null> =>
  Object.fromEntries(PROFILE_FIELDS.map((k) => [k, k === "name" ? f.name.trim() : (f[k as Exclude<ProfileField, "name">]?.trim() || null)])) as Record<ProfileField, string | null>;

export async function listProductBillingProfiles(businessId: string): Promise<ProductBillingProfile[]> {
  await fillFromSibling(businessId);
  return (await prisma.productBillingProfile.findMany({ where: { businessId }, orderBy: { productKey: "asc" } })).map(toProfile);
}

/**
 * So nobody types the same details twice: a product the business uses that has no profile yet starts as a copy of the business's most recently changed profile
 * (everything shared; order numbering is left out), marked source "copy". It is a one-time copy, never a link, and is made the first time the profiles are read.
 */
async function fillFromSibling(businessId: string): Promise<void> {
  const [products, profiles] = await Promise.all([
    prisma.businessProduct.findMany({ where: { businessId }, select: { productKey: true } }),
    prisma.productBillingProfile.findMany({ where: { businessId }, orderBy: { updatedAt: "desc" } }),
  ]);
  const source = profiles[0];
  if (!source) return;
  for (const { productKey } of products) {
    if (profiles.some((p) => p.productKey === productKey)) continue;
    const data = { ...toProfile(source), productKey, orderNumberPrefix: null, orderNumberNextValue: null, orderNumberPadding: null };
    const { version: _v, source: _s, updatedAt: _u, ...fields } = data;
    void _v; void _s; void _u;
    try {
      await prisma.productBillingProfile.create({ data: { ...fields, source: "copy" } });
      await audit({ actorUserId: null, action: "billing.profile_saved", subject: businessId, detail: { productKey, source: "copy", editedBy: null, version: 1, created: true } });
    } catch {
      /* another read made it first */
    }
  }
}

/** The product reports its live order counter. No version change and no history: it is not an edit, the Account just shows the current number. */
export async function setOrderCounter(businessId: string, productKey: string, counter: { orderNumberNextValue: string; orderNumberPrefix?: string; orderNumberPadding?: string }): Promise<boolean> {
  const where = { businessId, productKey };
  // A profile with no order numbering yet is seeded once from the product's own setting; one that has it only has its counter moved.
  if (counter.orderNumberPrefix && counter.orderNumberPadding) {
    const seeded = await prisma.productBillingProfile.updateMany({ where: { ...where, orderNumberPrefix: null }, data: { orderNumberPrefix: counter.orderNumberPrefix, orderNumberPadding: counter.orderNumberPadding, orderNumberNextValue: counter.orderNumberNextValue } });
    if (seeded.count > 0) return true;
  }
  const res = await prisma.productBillingProfile.updateMany({ where: { ...where, orderNumberPrefix: { not: null } }, data: { orderNumberNextValue: counter.orderNumberNextValue } });
  return res.count > 0;
}

export async function getProductBillingProfile(businessId: string, productKey: string): Promise<ProductBillingProfile | null> {
  const row = await prisma.productBillingProfile.findUnique({ where: { businessId_productKey: { businessId, productKey } } });
  return row ? toProfile(row) : null;
}

/**
 * Saves a profile. `baseVersion` is the version the editor saw, or null when the editor saw no profile yet (a first save). A write that changes nothing keeps the
 * version. Each real change writes an audit row with the field names and old and new values.
 */
export async function saveProductBillingProfile(args: { businessId: string; productKey: string; fields: ProfileFields; baseVersion: number | null; source: "account" | "product"; editedBy?: string | null }): Promise<SaveResult> {
  const { businessId, productKey, baseVersion, source } = args;
  if (!(await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } }))) return { ok: false, reason: "not_found" };
  const data = clean(args.fields);
  const existing = await getProductBillingProfile(businessId, productKey);
  const current = () => getProductBillingProfile(businessId, productKey);

  if (!existing) {
    if (baseVersion !== null) return { ok: false, reason: "conflict", current: null };
    try {
      await prisma.productBillingProfile.create({ data: { businessId, productKey, source, ...data, name: data.name ?? "" } });
    } catch {
      return { ok: false, reason: "conflict", current: await current() };
    }
    const created = (await current())!;
    await audit({ actorUserId: null, action: "billing.profile_saved", subject: businessId, detail: { productKey, source, editedBy: args.editedBy ?? null, version: 1, created: true } });
    return { ok: true, profile: created };
  }

  const changed = PROFILE_FIELDS.filter((k) => (existing[k] ?? null) !== (data[k] ?? null));
  if (baseVersion !== existing.version) {
    // Someone saved the same values the editor is sending: not a conflict worth showing.
    if (changed.length === 0) return { ok: true, profile: existing };
    return { ok: false, reason: "conflict", current: existing };
  }
  if (changed.length === 0) return { ok: true, profile: existing };
  const res = await prisma.productBillingProfile.updateMany({ where: { businessId, productKey, version: baseVersion }, data: { ...data, name: data.name ?? "", source, version: { increment: 1 } } });
  if (res.count === 0) return { ok: false, reason: "conflict", current: await current() };
  const saved = (await current())!;
  await audit({ actorUserId: null, action: "billing.profile_saved", subject: businessId, detail: { productKey, source, editedBy: args.editedBy ?? null, version: saved.version, changes: Object.fromEntries(changed.map((k) => [k, { from: existing[k] ?? null, to: data[k] ?? null }])) } });
  return { ok: true, profile: saved };
}

/** "Copy from another product": a one-time copy of the fields into the target, never a link. The target's version rules apply as for any save. */
export async function copyProductBillingProfile(args: { businessId: string; fromProductKey: string; toProductKey: string; baseVersion: number | null; source: "account" | "product"; editedBy?: string | null }): Promise<SaveResult | { ok: false; reason: "no_source" }> {
  const from = await getProductBillingProfile(args.businessId, args.fromProductKey);
  if (!from) return { ok: false, reason: "no_source" };
  // Order numbering belongs to one product (its counter is live), so it is never copied.
  const fields = { ...from, orderNumberPrefix: null, orderNumberNextValue: null, orderNumberPadding: null };
  return saveProductBillingProfile({ businessId: args.businessId, productKey: args.toProductKey, fields, baseVersion: args.baseVersion, source: args.source, editedBy: args.editedBy });
}

/** The changes made to one product's profile, newest first, read back from the audit rows each save wrote. */
export async function productBillingProfileHistory(businessId: string, productKey: string, limit = 50): Promise<ProductBillingProfileChange[]> {
  const rows = await prisma.auditLog.findMany({ where: { action: "billing.profile_saved", subject: businessId, detail: { path: ["productKey"], equals: productKey } }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map((r) => {
    const d = (r.detail ?? {}) as { source?: string; editedBy?: string | null; version?: number; created?: boolean; changes?: Record<string, { from: string | null; to: string | null }> };
    return {
      at: r.createdAt.toISOString(),
      version: d.version ?? 1,
      source: d.source ?? "account",
      editedBy: d.editedBy ?? null,
      created: d.created === true,
      changes: Object.entries(d.changes ?? {}).map(([field, v]) => ({ field, from: v.from ?? null, to: v.to ?? null })),
    };
  });
}

type Db = Prisma.TransactionClient | typeof prisma;

/** The part of a product's saved profile an invoice and a billing message use, or null when the product has none. */
export async function getProductBuyer(businessId: string, productKey: string, db: Db = prisma): Promise<Buyer | null> {
  const r = await db.productBillingProfile.findUnique({ where: { businessId_productKey: { businessId, productKey } } });
  return r ? { name: r.name, addressLine1: r.addressLine1, addressLine2: r.addressLine2, city: r.city, state: r.state, postalCode: r.postalCode, country: r.country, gstin: r.gstin, contactName: r.contactName, contactEmail: r.contactEmail, contactPhone: r.contactPhone } : null;
}

/** Where a product's billing messages go: that product's billing email, if it has one. */
export async function getProductBillingEmail(businessId: string, productKey: string): Promise<string | null> {
  const r = await prisma.productBillingProfile.findUnique({ where: { businessId_productKey: { businessId, productKey } }, select: { contactEmail: true } });
  return r?.contactEmail?.trim() || null;
}

/**
 * A confirmed payment from a business with no profile for this product yet (a paid-plan sign-up: the Store took the details once) creates the product's profile from
 * them. A profile that exists is never changed by a payment: it is edited in the Account or the product, and the Store pays with it as it is.
 */
export async function createProfileFromPayment(businessId: string, productKey: string, buyer: Buyer, db: Db = prisma): Promise<void> {
  if (await db.productBillingProfile.findUnique({ where: { businessId_productKey: { businessId, productKey } }, select: { version: true } })) return;
  await db.productBillingProfile.create({
    data: { businessId, productKey, source: "payment", name: buyer.name, addressLine1: buyer.addressLine1 ?? null, addressLine2: buyer.addressLine2 ?? null, city: buyer.city ?? null, state: buyer.state ?? null, postalCode: buyer.postalCode ?? null, country: buyer.country ?? null, gstin: buyer.gstin ?? null, contactName: buyer.contactName ?? null, contactEmail: buyer.contactEmail ?? null, contactPhone: buyer.contactPhone ?? null },
  });
}
