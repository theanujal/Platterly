"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { purgeTenantData, ConfirmationMismatchError } from "@/lib/tenant-purge/purge";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Chunk 5 Group 5.4 — owner-only (see `permissions.ts`'s `tenant: ["delete"]`
 * grant, which only `owner` has — not even the owner-level `admin` role).
 */
export async function purgeTenantDataAction(typedConfirmation: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ tenant: ["delete"] }, organizationId);

  try {
    await purgeTenantData(organizationId, session.user.id, typedConfirmation);
  } catch (error) {
    if (error instanceof ConfirmationMismatchError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return { ok: true };
}
