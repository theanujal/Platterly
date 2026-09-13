"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-session";
import {
  createTenant,
  updateTenant,
  suspendTenant,
  activateTenant,
  deactivateTenant,
  overrideSlug,
  type TenantProfileInput,
  type TenantProfileUpdateInput,
} from "@/modules/tenants/tenant";
import { assignPlan } from "@/modules/subscriptions/subscription";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function createTenantAction(input: TenantProfileInput): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  try {
    await createTenant(input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/super/tenants");
  return { ok: true };
}

export async function updateTenantAction(id: string, input: TenantProfileUpdateInput): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  try {
    await updateTenant(id, input, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/super/tenants/${id}`);
  return { ok: true };
}

export async function suspendTenantAction(id: string): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  await suspendTenant(id, session.user.id);
  revalidatePath(`/super/tenants/${id}`);
  revalidatePath("/super/tenants");
  return { ok: true };
}

export async function activateTenantAction(id: string): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  await activateTenant(id, session.user.id);
  revalidatePath(`/super/tenants/${id}`);
  revalidatePath("/super/tenants");
  return { ok: true };
}

export async function deactivateTenantAction(id: string): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  await deactivateTenant(id, session.user.id);
  revalidatePath(`/super/tenants/${id}`);
  revalidatePath("/super/tenants");
  return { ok: true };
}

export async function overrideSlugAction(id: string, newSlug: string): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  try {
    await overrideSlug(id, newSlug, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/super/tenants/${id}`);
  return { ok: true };
}

export async function assignPlanAction(tenantId: string, subscriptionPlanId: string): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  try {
    await assignPlan(tenantId, subscriptionPlanId, session.user.id);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/super/tenants/${tenantId}`);
  return { ok: true };
}
