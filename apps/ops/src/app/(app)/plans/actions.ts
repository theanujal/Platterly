"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EntitlementDef, EntitlementValues, ProductManifest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { PlanError, createPlan, setPlanActive, updatePlan, type PlanInput } from "@/modules/plans/plans";
import { SubscriptionError, assignPlan } from "@/modules/subscriptions/subscriptions";

export interface PlanFormState {
  error?: string;
  saved?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const optionalNumber = (form: FormData, name: string): number | null => {
  const raw = text(form, name);
  return raw === "" ? null : Number(raw);
};

/** Reads `ent:<key>` fields according to the product's declared entitlements. Blank limit = unlimited (null). */
function readEntitlements(form: FormData, defs: EntitlementDef[]): EntitlementValues {
  const values: EntitlementValues = {};
  for (const def of defs) {
    const raw = form.get(`ent:${def.key}`);
    if (def.type === "flag") values[def.key] = raw === "on";
    else if (def.type === "limit") values[def.key] = raw === null || String(raw).trim() === "" ? null : Number(raw);
    else values[def.key] = String(raw ?? "").trim();
  }
  return values;
}

export async function savePlanAction(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const staff = await requireStaff();
  const id = text(formData, "id");
  const productKey = text(formData, "productKey");
  const product = await prisma.product.findUnique({ where: { key: productKey } });
  const manifest = product?.manifest as unknown as ProductManifest | null;
  if (!manifest) return { error: "Read this product's manifest first." };

  const input: PlanInput = {
    productKey,
    code: text(formData, "code"),
    name: text(formData, "name"),
    description: text(formData, "description"),
    isTrial: formData.get("isTrial") === "on",
    trialDurationDays: optionalNumber(formData, "trialDurationDays"),
    priceMonthly: optionalNumber(formData, "priceMonthly"),
    priceAnnual: optionalNumber(formData, "priceAnnual"),
    gstPercent: Number(text(formData, "gstPercent") || 18),
    highlights: text(formData, "highlights").split("\n"),
    entitlements: readEntitlements(formData, manifest.entitlements),
  };
  try {
    if (id) {
      const { reissued } = await updatePlan(id, input, staff.id);
      revalidatePath("/plans");
      revalidatePath(`/plans/${id}`);
      return { saved: reissued > 0 ? `Saved. A new snapshot went to ${reissued} business${reissued === 1 ? "" : "es"} on this plan.` : "Saved." };
    }
    const plan = await createPlan(input, staff.id);
    revalidatePath("/plans");
    redirect(`/plans/${plan.id}`);
  } catch (error) {
    if (error instanceof PlanError) return { error: error.message };
    throw error;
  }
}

export async function setPlanActiveAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const id = text(formData, "id");
  await setPlanActive(id, formData.get("active") === "1", staff.id);
  revalidatePath("/plans");
  revalidatePath(`/plans/${id}`);
}

export async function assignPlanAction(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const staff = await requireStaff();
  const businessId = text(formData, "businessId");
  try {
    await assignPlan({ businessId, productKey: text(formData, "productKey"), planId: text(formData, "planId"), actorUserId: staff.id });
    revalidatePath(`/businesses/${businessId}`);
    return { saved: "Plan assigned. A new snapshot is on its way to the product." };
  } catch (error) {
    if (error instanceof SubscriptionError || error instanceof PlanError) return { error: error.message };
    throw error;
  }
}
