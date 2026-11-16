import "server-only";
import { parseProductBillingProfileAnswer, parseProductBillingProfileConflict, type ProductBillingProfileRecord, type ProductProfileFields } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { OpsUnavailableError, opsBilling } from "./billing-client";
import { opsLink } from "./config";
import { canonicalUrl } from "@/lib/seo/canonical";
import { updateTenant, type TenantProfileUpdateInput } from "@/modules/tenants/tenant";

/**
 * Caterly's side of the shared billing profile (docs/product-billing-profiles-plan.md). The record lives in Platterly Ops, one per business and product; the
 * Account and this product's Business Profile page both edit it. Caterly keeps a read copy (`organization_billing_profile`) and copies the shared fields into its
 * own Organization columns so invoices and the storefront never wait on Ops. The business name, mobile number and order numbering ARE part of it now (one set of fields on both pages): a profile pushed from the Account is applied to them with `applyProfileIdentity`, which goes through `updateTenant` so Ops and the Platform hear about a new name.
 */
export const profileLinkOn = () => opsLink() !== null;

/** Replaces the read copy only with a newer version, and copies the shared fields into the Organization row. Returns whether it changed anything. */
export async function storeProfileCopy(organizationId: string, profile: ProductBillingProfileRecord): Promise<boolean> {
  const held = await prisma.organizationBillingProfile.findUnique({ where: { organizationId }, select: { version: true, profile: true } });
  if (held && held.version >= profile.version) return false;
  // The logo is a link. A link from the profile replaces the kitchen's logo (it was uploaded in the Account); an empty one removes it only when the copy held
  // one before (the Account removed it), so a first sync from a profile with no logo never wipes the kitchen's own.
  const heldLogo = (held?.profile as { logoUrl?: string | null } | undefined)?.logoUrl ?? null;
  const logo = profile.logoUrl ? { logo: profile.logoUrl } : heldLogo ? { logo: null } : {};
  const data = { version: profile.version, profile: profile as unknown as object, syncedAt: new Date() };
  await prisma.$transaction([
    prisma.organizationBillingProfile.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data }),
    prisma.organization.update({
      where: { id: organizationId },
      data: { addressLine1: profile.addressLine1, addressLine2: profile.addressLine2, city: profile.city, state: profile.state, postalCode: profile.postalCode, country: profile.country, gstNumber: profile.gstin, businessDescription: profile.description, websiteUrl: profile.website, instagramUrl: profile.instagram, facebookUrl: profile.facebook, ...logo },
    }),
  ]);
  return true;
}

/**
 * Applies the parts of a profile pushed from the Account that are not plain copies: the business name, the mobile number and the order numbering. They go through
 * `updateTenant` so the audit trail, the Ops record and the Platform's business name follow. Order numbers only ever go UP from here (the next number is a live
 * counter; lowering it could repeat a number already given to an order); the product's own form still sets it freely.
 */
export async function applyProfileIdentity(organizationId: string, profile: ProductBillingProfileRecord): Promise<void> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, contactPhone: true, orderNumberPrefix: true, orderNumberNextValue: true, orderNumberPadding: true } });
  const input: TenantProfileUpdateInput = { name: org.name };
  let changed = false;
  if (profile.name.trim() && profile.name.trim() !== org.name) { input.name = profile.name.trim(); changed = true; }
  if (profile.businessPhone && profile.businessPhone !== org.contactPhone) { input.contactPhone = profile.businessPhone; changed = true; }
  if (profile.orderNumberPrefix && profile.orderNumberPadding && profile.orderNumberNextValue) {
    if (profile.orderNumberPrefix !== org.orderNumberPrefix) { input.orderNumberPrefix = profile.orderNumberPrefix; changed = true; }
    if (Number(profile.orderNumberPadding) !== org.orderNumberPadding) { input.orderNumberPadding = Number(profile.orderNumberPadding); changed = true; }
    if (Number(profile.orderNumberNextValue) > org.orderNumberNextValue) { input.orderNumberNextValue = Number(profile.orderNumberNextValue); changed = true; }
  }
  if (changed) await updateTenant(organizationId, input);
}

/**
 * Tells Ops the live order counter after an order is numbered (and seeds the prefix and digits once for a profile that has none), so the Account shows the number
 * Caterly will give next. Best effort and never awaited by an order: a failure only leaves the Account's number a little behind until the next order.
 */
export async function reportOrderCounter(organizationId: string): Promise<void> {
  if (!profileLinkOn()) return;
  try {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { businessId: true, orderNumberPrefix: true, orderNumberNextValue: true, orderNumberPadding: true } });
    await opsBilling("PUT", `/businesses/${org.businessId}/billing-profile`, { counter: { orderNumberNextValue: String(org.orderNumberNextValue), orderNumberPrefix: org.orderNumberPrefix, orderNumberPadding: String(org.orderNumberPadding) } });
  } catch {
    /* the next order reports again */
  }
}

/** The profile as it stands in Ops, or null when it has none yet. Throws OpsUnavailableError when Ops cannot be reached. */
export async function fetchOwnProfile(businessId: string): Promise<ProductBillingProfileRecord | null> {
  const { status, json } = await opsBilling("GET", `/businesses/${businessId}/billing-profile`);
  if (status === 404) return null;
  const parsed = status === 200 ? (json && typeof json === "object" && (json as { profile: unknown }).profile === null ? { ok: true as const, profile: null } : parseProductBillingProfileAnswer(json)) : null;
  if (!parsed || !parsed.ok) throw new OpsUnavailableError();
  return "value" in parsed ? parsed.value.profile : parsed.profile;
}

/**
 * Refreshes the read copy when the Business Profile page opens, so a push that was lost never leaves the page stale. Never throws: if Ops cannot be reached the
 * page simply shows what Caterly already holds.
 */
export async function refreshOwnProfile(organizationId: string, businessId: string): Promise<void> {
  if (!profileLinkOn()) return;
  try {
    const profile = await fetchOwnProfile(businessId);
    if (profile) {
      await storeProfileCopy(organizationId, profile);
      // A profile made before order numbering was shared has none: hand Ops this product's own setting once.
      if (!profile.orderNumberPrefix) await reportOrderCounter(organizationId);
    } else {
      await seedOwnProfile(organizationId, businessId);
    }
  } catch {
    /* keep what is held */
  }
}

/**
 * A business with no profile in Ops yet (it signed up before profiles, or a push was lost): sends Caterly's own details as its first profile, so the Account
 * shows them without anyone retyping. Skipped while the business still has no real name. Best effort: if Ops refuses (a field Caterly allows but the profile
 * does not, such as an odd GSTIN), nothing changes and the first save from either page still creates the profile.
 */
export async function seedOwnProfile(organizationId: string, businessId: string): Promise<boolean> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (!org.name.trim() || org.name === "Unnamed Business") return false;
  const absolute = (u: string | null) => (u ? (/^https?:\/\//.test(u) ? u : canonicalUrl(u)) : null);
  const result = await saveOwnProfile(businessId, null, {
    name: org.name, brandName: null, businessPhone: org.contactPhone, contactName: null, contactEmail: null, contactPhone: null,
    addressLine1: org.addressLine1, addressLine2: org.addressLine2, city: org.city, state: org.state, postalCode: org.postalCode, country: org.country, gstin: org.gstNumber,
    description: org.businessDescription, website: org.websiteUrl, instagram: org.instagramUrl, facebook: org.facebookUrl,
    orderNumberPrefix: org.orderNumberPrefix, orderNumberNextValue: String(org.orderNumberNextValue), orderNumberPadding: String(org.orderNumberPadding),
    logoUrl: absolute(org.logo),
  });
  if (!result.ok) return false;
  await storeProfileCopy(organizationId, result.profile);
  return true;
}

export type SaveOwnResult = { ok: true; profile: ProductBillingProfileRecord } | { ok: false; conflict: ProductBillingProfileRecord | null } | { ok: false; unknownBusiness: true } | { ok: false; error: string };

/** Saves the shared fields to Ops with the version the form was based on. Nothing local changes unless this says ok. */
export async function saveOwnProfile(businessId: string, baseVersion: number | null, fields: ProductProfileFields): Promise<SaveOwnResult> {
  let reply;
  try {
    reply = await opsBilling("PUT", `/businesses/${businessId}/billing-profile`, { baseVersion, fields });
  } catch {
    return { ok: false, error: "Your billing profile could not be saved right now because Platterly billing could not be reached. Nothing was changed. Please try again." };
  }
  if (reply.status === 409) {
    const conflict = parseProductBillingProfileConflict(reply.json);
    return conflict.ok ? { ok: false, conflict: conflict.value.current } : { ok: false, error: "We could not save your profile. Please try again." };
  }
  // Ops has not heard of this business yet (its sign-up event is still on its way): the save stays local and the profile reaches Ops with the next one.
  if (reply.status === 404) return { ok: false, unknownBusiness: true };
  if (reply.status === 400) return { ok: false, error: (reply.json as { error?: string })?.error ?? "Those details could not be saved." };
  const parsed = reply.status === 200 ? parseProductBillingProfileAnswer(reply.json) : null;
  return parsed?.ok ? { ok: true, profile: parsed.value.profile } : { ok: false, error: "We could not save your profile. Please try again." };
}
