"use server";

import { matchesDeclaredType } from "@/lib/storage/file-signature";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { updateTenant, type TenantProfileUpdateInput } from "@/modules/tenants/tenant";
import { getStorageDriver } from "@/lib/storage/storage";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { stringField } from "@/lib/form-data";
import { prisma } from "@/lib/db";
import { canonicalUrl } from "@/lib/seo/canonical";
import type { ProductBillingProfileRecord } from "@platterly/contract";
import { profileLinkOn, saveOwnProfile, storeProfileCopy } from "@/modules/ops-link/billing-profile";

/** `conflict` means the shared profile changed elsewhere (the Account) since the form opened: the form keeps the person's edits and offers the new values. */
export type ProfileConflict = { version: number | null; at: string | null; values: Partial<Record<"brandName" | "businessDescription" | "websiteUrl" | "instagramUrl" | "facebookUrl" | "linkedinUrl" | "addressLine1" | "addressLine2" | "city" | "state" | "postalCode" | "country" | "gstin" | "businessName" | "mobileNumber" | "orderNumberPrefix" | "orderNumberNextValue" | "orderNumberPadding" | "billingContactName" | "billingEmail" | "billingPhone", string>> | null };
export type ActionResult = { ok: true } | { ok: false; error: string; conflict?: ProfileConflict };

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
/** A trimmed text field, or null when blank (so a cleared shared field really clears). */
const textOrNull = (formData: FormData, name: string): string | null => stringField(formData, name) ?? null;
/** A phone from a phone input that is empty or only a country code counts as no phone. */
const phoneOrNull = (value: string | null): string | null => ((value?.replace(/\D/g, "").length ?? 0) > 3 ? value : null);

const MAX_LOGO_BYTES = 4 * 1024 * 1024;
const ALLOWED_LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function numberField(formData: FormData, name: string): number | undefined {
  const raw = stringField(formData, name);
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * The Business Profile page has two cards, like the Account's Business & Billing page, with the same fields: the Business Profile (logo, brand name, description,
 * mobile number, website, Instagram, Facebook, order numbering) and the Billing Profile (the business name, GSTIN, address, billing contact). Each has its own form
 * and says which `section` it is saving; a field the form did not send keeps its current value. Everything lives in the business's billing profile in Platterly
 * Ops: it is saved there first, with the version the form was based on, so a change made meanwhile in the Account is never silently overwritten. If Ops refuses,
 * nothing local changes. The business name is ONE field, in the Billing Profile: it is the name on invoices and the business's name everywhere.
 */
export async function updateBusinessProfileAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);
  const section = formData.get("section") === "billing" ? "billing" : "business";

  const input: TenantProfileUpdateInput = { name: "" };
  let logoUrl: string | undefined;
  let removeLogo = false;

  if (section === "business") {
    // The business always has a mobile number: it cannot be cleared or saved invalid here.
    const mobileNumber = stringField(formData, "mobileNumber");
    if (!mobileNumber || !isValidPhone(normalizePhone(mobileNumber))) return { ok: false, error: "Enter a valid mobile number." };

    const logo = formData.get("logo");
    if (logo instanceof File && logo.size > 0) {
      const extension = ALLOWED_LOGO_TYPES[logo.type];
      if (!extension) return { ok: false, error: "Logo must be a PNG, JPG or WebP image." };
      if (logo.size > MAX_LOGO_BYTES) return { ok: false, error: "Logo must be 4MB or smaller." };
      const buffer = Buffer.from(await logo.arrayBuffer());
      if (!matchesDeclaredType(buffer, logo.type)) return { ok: false, error: "That file is not a real PNG, JPG or WebP image." };
      const uploaded = await getStorageDriver().upload(`organizations/${organizationId}/logo.${extension}`, buffer, logo.type);
      logoUrl = uploaded.url;
    } else if (formData.get("removeLogo") === "true") {
      removeLogo = true;
    }

    const orderNumberNextValue = numberField(formData, "orderNumberNextValue");
    if (orderNumberNextValue !== undefined && orderNumberNextValue < 1) return { ok: false, error: "Starting number must be at least 1." };
    const orderNumberPadding = numberField(formData, "orderNumberPadding");
    if (orderNumberPadding !== undefined && (orderNumberPadding < 1 || orderNumberPadding > 10)) return { ok: false, error: "Digits must be between 1 and 10." };

    Object.assign(input, {
      businessDescription: textOrNull(formData, "businessDescription"),
      contactPhone: normalizePhone(mobileNumber),
      websiteUrl: textOrNull(formData, "websiteUrl"),
      instagramUrl: textOrNull(formData, "instagramUrl"),
      facebookUrl: textOrNull(formData, "facebookUrl"),
      linkedinUrl: textOrNull(formData, "linkedinUrl"),
      orderNumberPrefix: stringField(formData, "orderNumberPrefix")?.toUpperCase(),
      orderNumberNextValue,
      orderNumberPadding,
    });
    if (logoUrl) input.logo = logoUrl;
    else if (removeLogo) input.logo = null;
  } else {
    const businessName = stringField(formData, "businessName");
    if (!businessName) return { ok: false, error: "Business name is required." };
    input.name = businessName;
    const gstin = textOrNull(formData, "gstin")?.toUpperCase() ?? null;
    if (gstin && !GSTIN.test(gstin)) return { ok: false, error: "Enter a valid 15-character GSTIN, or leave it blank." };
    Object.assign(input, {
      addressLine1: textOrNull(formData, "addressLine1"),
      addressLine2: textOrNull(formData, "addressLine2"),
      city: textOrNull(formData, "city"),
      state: textOrNull(formData, "state"),
      postalCode: textOrNull(formData, "postalCode"),
      country: textOrNull(formData, "country"),
      gstNumber: gstin,
    });
  }

  let savedProfile: ProductBillingProfileRecord | null = null;
  if (profileLinkOn()) {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { billingProfile: { select: { profile: true } } } });
    const held = org.billingProfile?.profile as unknown as ProductBillingProfileRecord | undefined;
    // What this form did not send stays as it is now.
    const pick = <K extends keyof TenantProfileUpdateInput>(key: K, current: string | null): string | null => (key in input ? ((input[key] as string | null | undefined) ?? null) : current);
    const logoNow = logoUrl ?? (removeLogo ? null : org.logo);
    const billing = section === "billing";
    const saved = await saveOwnProfile(org.businessId, stringField(formData, "profileVersion") ? Number(stringField(formData, "profileVersion")) : null, {
      name: billing ? input.name : (held?.name ?? org.name),
      brandName: section === "business" ? textOrNull(formData, "brandName") : (held?.brandName ?? null),
      businessPhone: section === "business" ? (input.contactPhone ?? null) : org.contactPhone,
      orderNumberPrefix: section === "business" ? (input.orderNumberPrefix ?? String(org.orderNumberPrefix)) : org.orderNumberPrefix,
      orderNumberNextValue: String(section === "business" ? (input.orderNumberNextValue ?? org.orderNumberNextValue) : org.orderNumberNextValue),
      orderNumberPadding: String(section === "business" ? (input.orderNumberPadding ?? org.orderNumberPadding) : org.orderNumberPadding),
      contactName: billing ? textOrNull(formData, "billingContactName") : (held?.contactName ?? null),
      contactEmail: billing ? textOrNull(formData, "billingEmail") : (held?.contactEmail ?? null),
      contactPhone: billing ? phoneOrNull(textOrNull(formData, "billingPhone")) : (held?.contactPhone ?? null),
      addressLine1: pick("addressLine1", org.addressLine1),
      addressLine2: pick("addressLine2", org.addressLine2),
      city: pick("city", org.city),
      state: pick("state", org.state),
      postalCode: pick("postalCode", org.postalCode),
      country: pick("country", org.country),
      gstin: pick("gstNumber", org.gstNumber),
      description: pick("businessDescription", org.businessDescription),
      website: pick("websiteUrl", org.websiteUrl),
      instagram: pick("instagramUrl", org.instagramUrl),
      facebook: pick("facebookUrl", org.facebookUrl),
      linkedin: pick("linkedinUrl", org.linkedinUrl),
      logoUrl: logoNow ? (/^https?:\/\//.test(logoNow) ? logoNow : canonicalUrl(logoNow)) : null,
    });
    if (!saved.ok && "unknownBusiness" in saved) {
      // Nothing to share with yet: keep the local save below.
    } else if (!saved.ok) {
      if ("conflict" in saved) {
        const c = saved.conflict;
        return {
          ok: false,
          error: "This profile was changed elsewhere (in the Account).",
          conflict: {
            version: c?.version ?? null,
            at: c?.updatedAt ?? null,
            values: c ? { brandName: c.brandName ?? "", businessDescription: c.description ?? "", websiteUrl: c.website ?? "", instagramUrl: c.instagram ?? "", facebookUrl: c.facebook ?? "", linkedinUrl: c.linkedin ?? "", addressLine1: c.addressLine1 ?? "", addressLine2: c.addressLine2 ?? "", city: c.city ?? "", state: c.state ?? "", postalCode: c.postalCode ?? "", country: c.country ?? "", gstin: c.gstin ?? "", businessName: c.name, mobileNumber: c.businessPhone ?? "", orderNumberPrefix: c.orderNumberPrefix ?? "", orderNumberNextValue: c.orderNumberNextValue ?? "", orderNumberPadding: c.orderNumberPadding ?? "", billingContactName: c.contactName ?? "", billingEmail: c.contactEmail ?? "", billingPhone: c.contactPhone ?? "" } : null,
          },
        };
      }
      return { ok: false, error: saved.error };
    }
    else savedProfile = saved.profile;
  }

  // The business name is saved with the Billing Profile; the business section leaves the name as it is.
  if (section === "business") input.name = (await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } })).name;
  await updateTenant(organizationId, input, session.user.id);
  if (savedProfile) await storeProfileCopy(organizationId, savedProfile);

  revalidatePath("/settings/account/business-profile");
  revalidatePath("/dashboard");
  return { ok: true };
}
