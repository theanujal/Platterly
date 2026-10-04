"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { userMessage } from "@/lib/errors";
import { InvalidKitchenRulesError, setKitchenRules } from "@/modules/kitchen/kitchen-rules";
import { addLocation, deleteLocation, makeDefaultLocation, renameLocation, setMultiLocationEnabled } from "@/modules/locations/locations";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateKitchenRulesAction(formData: FormData): Promise<ActionResult> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);
  try {
    await setKitchenRules(organizationId, {
      extraPercent: Number(formData.get("extraPercent")),
      daysBeforeEvent: Number(formData.get("daysBeforeEvent")),
    });
  } catch (error) {
    if (error instanceof InvalidKitchenRulesError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath("/settings/kitchen/kitchen-rules");
  revalidatePath("/kitchen-dashboard", "layout");
  return { ok: true };
}

/** Chunk 23 — the Locations card on this page. Owner only (`settings:edit`); the organization comes from the session. */
async function attempt(change: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await change();
  } catch (error) {
    return { ok: false, error: userMessage(error, "Something went wrong.") };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setMultiLocationAction(enabled: boolean): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);
  return attempt(() => setMultiLocationEnabled(organizationId, enabled === true, session.user.id));
}

export async function addLocationAction(name: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);
  return attempt(() => addLocation(organizationId, name, session.user.id));
}

export async function renameLocationAction(id: string, name: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);
  return attempt(() => renameLocation(organizationId, id, name, session.user.id));
}

export async function makeDefaultLocationAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);
  return attempt(() => makeDefaultLocation(organizationId, id, session.user.id));
}

export async function deleteLocationAction(id: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);
  return attempt(() => deleteLocation(organizationId, id, session.user.id));
}
