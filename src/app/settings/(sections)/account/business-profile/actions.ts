"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { updateTenant, type TenantProfileUpdateInput } from "@/modules/tenants/tenant";
import { getStorageDriver } from "@/lib/storage/storage";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Reuses the same `updateTenant` call the onboarding wizard uses — the
 * fields are identical, this is just the place a caterer reaches them
 * again after onboarding (Dashboard's nudge banner links here). Never
 * touches `onboardingCompletedAt`.
 */
export async function updateBusinessProfileAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);

  const businessName = stringField(formData, "businessName");
  if (!businessName) {
    return { ok: false, error: "Business name is required." };
  }

  let logoUrl: string | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const extension = ALLOWED_LOGO_TYPES[logo.type];
    if (!extension) {
      return { ok: false, error: "Logo must be a PNG or JPG image." };
    }
    if (logo.size > MAX_LOGO_BYTES) {
      return { ok: false, error: "Logo must be 2MB or smaller." };
    }
    const buffer = Buffer.from(await logo.arrayBuffer());
    const uploaded = await getStorageDriver().upload(
      `organizations/${organizationId}/logo.${extension}`,
      buffer,
      logo.type,
    );
    logoUrl = uploaded.url;
  }

  const input: TenantProfileUpdateInput = {
    name: businessName,
    businessDescription: stringField(formData, "businessDescription"),
    contactPhone: stringField(formData, "mobileNumber"),
    addressLine1: stringField(formData, "addressLine1"),
    city: stringField(formData, "city"),
    state: stringField(formData, "state"),
    postalCode: stringField(formData, "postalCode"),
    country: stringField(formData, "country"),
    gstNumber: stringField(formData, "gstNumber"),
    gstShowOnInvoices: formData.get("gstShowOnInvoices") === "true",
    websiteUrl: stringField(formData, "websiteUrl"),
    instagramUrl: stringField(formData, "instagramUrl"),
    facebookUrl: stringField(formData, "facebookUrl"),
  };
  if (logoUrl) {
    input.logo = logoUrl;
  }

  await updateTenant(organizationId, input, session.user.id);

  revalidatePath("/settings/account/business-profile");
  revalidatePath("/dashboard");
  return { ok: true };
}
