"use server";

import { matchesDeclaredType } from "@/lib/storage/file-signature";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { updateTenant, markOnboardingComplete, markOnboardingDismissed } from "@/modules/tenants/tenant";
import { prisma } from "@/lib/db";
import { getStorageDriver } from "@/lib/storage/storage";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { userMessage } from "@/lib/errors";
import { saveGstSettings, DEFAULT_GST_RATE } from "@/modules/payments/payment-settings";
import { stringField } from "@/lib/form-data";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_LOGO_BYTES = 4 * 1024 * 1024;
const ALLOWED_LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/**
 * Chunk 4 Group 4.2 — orchestrates the wizard's final submit. The
 * Organization already exists by this point (provisioned at signup — see
 * `auto-provision.ts`), so this is purely an update: fill in the business
 * profile fields, upload the logo if given, and mark onboarding complete.
 */
/**
 * "Skip for now" (AJ, 2026-10-13): keeps whatever the person typed so far instead of throwing it away, so it shows in
 * Settings, then marks the wizard as left so it is never shown again. Only the mobile number blocks the skip, because
 * every WhatsApp goes to it (Sharath, 2026-10-23). Any other field that is missing or not valid yet (GST number,
 * numbering) is simply not saved. Onboarding stays "not complete", so the Dashboard nudge remains until the details are filled in Settings.
 */
export async function skipOnboardingAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();

  const mobileNumber = stringField(formData, "mobileNumber");
  if (!mobileNumber || !isValidPhone(normalizePhone(mobileNumber))) return { ok: false, error: "Enter a valid mobile number to skip for now." };
  const phone = normalizePhone(mobileNumber);
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
  const nextValue = Number.parseInt(stringField(formData, "orderNumberNextValue") ?? "", 10);
  const padding = Number.parseInt(stringField(formData, "orderNumberPadding") ?? "", 10);
  const numberingOk = Number.isInteger(nextValue) && nextValue >= 1 && Number.isInteger(padding) && padding >= 1 && padding <= 10;

  let logoUrl: string | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0 && logo.size <= MAX_LOGO_BYTES && ALLOWED_LOGO_TYPES[logo.type]) {
    const buffer = Buffer.from(await logo.arrayBuffer());
    if (matchesDeclaredType(buffer, logo.type)) {
      logoUrl = (await getStorageDriver().upload(`organizations/${organizationId}/logo.${ALLOWED_LOGO_TYPES[logo.type]}`, buffer, logo.type)).url;
    }
  }

  await updateTenant(
    organizationId,
    {
      name: stringField(formData, "businessName") ?? organization.name,
      businessDescription: stringField(formData, "businessDescription"),
      addressLine1: stringField(formData, "addressLine1"),
      city: stringField(formData, "city"),
      state: stringField(formData, "state"),
      postalCode: stringField(formData, "postalCode"),
      country: stringField(formData, "country"),
      contactPhone: phone,
      websiteUrl: stringField(formData, "websiteUrl"),
      instagramUrl: stringField(formData, "instagramUrl"),
      facebookUrl: stringField(formData, "facebookUrl"),
      logo: logoUrl,
      ...(numberingOk ? { orderNumberPrefix: stringField(formData, "orderNumberPrefix")?.toUpperCase(), orderNumberNextValue: nextValue, orderNumberPadding: padding } : {}),
    },
    session.user.id,
  );

  // The GST number, rate and type are saved together, and only when they are valid; otherwise none of them is.
  const gstNumber = stringField(formData, "gstNumber");
  if (gstNumber) {
    try {
      await saveGstSettings(organizationId, {
        number: gstNumber,
        showOnInvoices: formData.get("gstShowOnInvoices") === "true",
        rate: Number(stringField(formData, "gstRate") ?? DEFAULT_GST_RATE),
        type: stringField(formData, "gstType") ?? "CGST_SGST",
      });
    } catch {
      // Not valid yet; they can finish it in Settings.
    }
  }

  await markOnboardingDismissed(organizationId, session.user.id);
  return { ok: true };
}

export async function completeOnboardingAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();

  const businessName = stringField(formData, "businessName");
  if (!businessName) {
    return { ok: false, error: "Business name is required." };
  }

  // AJ's explicit ask (2026-09-16): every Contact & Address field is
  // mandatory — client-side gating (onboarding-wizard.tsx's
  // canAdvanceFromStep2) already blocks Continue, this is defense in depth.
  const REQUIRED_STEP_2_FIELDS: Record<string, string> = {
    addressLine1: "Street address",
    city: "City",
    state: "State",
    postalCode: "ZIP code",
    country: "Country",
  };
  for (const [field, label] of Object.entries(REQUIRED_STEP_2_FIELDS)) {
    if (!stringField(formData, field)) {
      return { ok: false, error: `${label} is required.` };
    }
  }

  // The business always has a phone (the wizard pre-fills the sign-up number).
  const mobileNumber = stringField(formData, "mobileNumber");
  if (!mobileNumber || !isValidPhone(normalizePhone(mobileNumber))) {
    return { ok: false, error: "Enter a valid mobile number." };
  }

  const orderNumberNextValue = Number.parseInt(stringField(formData, "orderNumberNextValue") ?? "1", 10);
  if (!Number.isInteger(orderNumberNextValue) || orderNumberNextValue < 1) {
    return { ok: false, error: "Starting number must be at least 1." };
  }
  const orderNumberPadding = Number.parseInt(stringField(formData, "orderNumberPadding") ?? "4", 10);
  if (!Number.isInteger(orderNumberPadding) || orderNumberPadding < 1 || orderNumberPadding > 10) {
    return { ok: false, error: "Digits must be between 1 and 10." };
  }

  let logoUrl: string | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const extension = ALLOWED_LOGO_TYPES[logo.type];
    if (!extension) {
      return { ok: false, error: "Logo must be a PNG, JPG or WebP image." };
    }
    if (logo.size > MAX_LOGO_BYTES) {
      return { ok: false, error: "Logo must be 4MB or smaller." };
    }
    const buffer = Buffer.from(await logo.arrayBuffer());
    if (!matchesDeclaredType(buffer, logo.type)) {
      return { ok: false, error: "That file is not a real PNG, JPG or WebP image." };
    }
    const uploaded = await getStorageDriver().upload(
      `organizations/${organizationId}/logo.${extension}`,
      buffer,
      logo.type,
    );
    logoUrl = uploaded.url;
  }

  await updateTenant(
    organizationId,
    {
      name: businessName,
      businessDescription: stringField(formData, "businessDescription"),
      addressLine1: stringField(formData, "addressLine1"),
      city: stringField(formData, "city"),
      state: stringField(formData, "state"),
      postalCode: stringField(formData, "postalCode"),
      country: stringField(formData, "country"),
      contactPhone: normalizePhone(mobileNumber),
      orderNumberPrefix: stringField(formData, "orderNumberPrefix")?.toUpperCase(),
      orderNumberNextValue,
      orderNumberPadding,
      gstNumber: stringField(formData, "gstNumber"),
      gstShowOnInvoices: formData.get("gstShowOnInvoices") === "true",
      websiteUrl: stringField(formData, "websiteUrl"),
      instagramUrl: stringField(formData, "instagramUrl"),
      facebookUrl: stringField(formData, "facebookUrl"),
      logo: logoUrl,
    },
    session.user.id,
  );

  // The GST rate and type are a per-kitchen setting (payments.gst), saved the same way as Settings -> Payments. Only
  // when a GST number was given; without one the defaults (5%, CGST + SGST) apply.
  const gstNumber = stringField(formData, "gstNumber");
  if (gstNumber) {
    try {
      await saveGstSettings(organizationId, {
        number: gstNumber,
        showOnInvoices: formData.get("gstShowOnInvoices") === "true",
        rate: Number(stringField(formData, "gstRate") ?? DEFAULT_GST_RATE),
        type: stringField(formData, "gstType") ?? "CGST_SGST",
      });
    } catch (error) {
      return { ok: false, error: userMessage(error, "Could not save your GST details.") };
    }
  }

  await markOnboardingComplete(organizationId, session.user.id);

  revalidatePath("/dashboard");
  return { ok: true };
}
