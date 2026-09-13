"use server";

import { headers as nextHeaders } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { requireSession } from "@/lib/auth/require-session";
import { generateUniqueSlug } from "@/modules/tenants/slug";
import { updateTenant } from "@/modules/tenants/tenant";
import { ensureTrialPlan } from "@/modules/subscriptions/trial-plan";
import { assignPlan } from "@/modules/subscriptions/subscription";
import { getStorageDriver } from "@/lib/storage/storage";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Chunk 4 Group 4.2 — orchestrates the wizard's final submit. Lives here
 * (not a pure `src/modules/` function) because `auth.api.createOrganization`
 * needs the request's `headers` to resolve the just-signed-up session — same
 * reasoning `src/app/super/actions.ts` uses for calling `auth.api.signOut`
 * inline. Delegates the actual domain work to existing Chunk 3 functions
 * (`updateTenant`, `ensureTrialPlan`, `assignPlan`) rather than duplicating
 * them.
 */
export async function completeOnboardingAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const businessName = stringField(formData, "businessName");
  if (!businessName) {
    return { ok: false, error: "Business name is required." };
  }

  const headers = await nextHeaders();
  let organizationId: string;
  try {
    const slug = await generateUniqueSlug(businessName);
    // Better Auth's createOrganization creates the Organization row AND a
    // Member(owner) row AND sets this session's activeOrganizationId, all
    // in one call — fundamentally different from Chunk 3's Super Admin
    // tenant creation, which never touches Member/session state.
    const created = await auth.api.createOrganization({ body: { name: businessName, slug }, headers });
    if (!created) {
      return { ok: false, error: "Could not create your business account." };
    }
    organizationId = created.id;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create your business account." };
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

  await updateTenant(
    organizationId,
    {
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
      logo: logoUrl,
    },
    session.user.id,
  );

  const trialPlan = await ensureTrialPlan();
  await assignPlan(organizationId, trialPlan.id, session.user.id);

  revalidatePath("/kitchenlogin");
  return { ok: true };
}
