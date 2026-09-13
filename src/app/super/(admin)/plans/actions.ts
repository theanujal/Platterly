"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-session";
import { createPlan, updatePlan, deactivatePlan, type PlanInput } from "@/modules/subscriptions/plan";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function createPlanAction(input: PlanInput): Promise<ActionResult> {
  await requireSuperAdmin();
  try {
    await createPlan(input);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/super/plans");
  return { ok: true };
}

export async function updatePlanAction(id: string, input: Omit<PlanInput, "code">): Promise<ActionResult> {
  await requireSuperAdmin();
  try {
    await updatePlan(id, input);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath("/super/plans");
  revalidatePath(`/super/plans/${id}`);
  return { ok: true };
}

export async function deactivatePlanAction(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await deactivatePlan(id);
  revalidatePath("/super/plans");
  return { ok: true };
}
