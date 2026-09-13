"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getSetting, setSetting } from "@/lib/settings/settings";

export type ActionResult = { ok: true } | { ok: false; error: string };

const SMS_KEY = "communication.sms";
const PUSH_KEY = "communication.push";
const INVOICE_TERMS_KEY = "communication.invoiceTerms";

interface ChannelToggle {
  enabled: boolean;
}

/**
 * Chunk 5 Group 5.4 — placeholder toggles for channels `notify()` (Chunk 2)
 * already supports selecting by `channel`, but has no real SMS/Push
 * provider behind it yet (Chunk 16's job). Stored via `TenantSetting` so a
 * later chunk has somewhere to read the preference from.
 */
export async function getSmsToggleAction(organizationId: string): Promise<boolean> {
  const stored = await getSetting<ChannelToggle>(organizationId, SMS_KEY);
  return stored?.enabled ?? false;
}

export async function getPushToggleAction(organizationId: string): Promise<boolean> {
  const stored = await getSetting<ChannelToggle>(organizationId, PUSH_KEY);
  return stored?.enabled ?? false;
}

export async function updateSmsToggleAction(formData: FormData): Promise<ActionResult> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);
  await setSetting(organizationId, SMS_KEY, { enabled: formData.get("enabled") === "true" });
  revalidatePath("/settings/communication/sms-settings");
  return { ok: true };
}

export async function updatePushToggleAction(formData: FormData): Promise<ActionResult> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);
  await setSetting(organizationId, PUSH_KEY, { enabled: formData.get("enabled") === "true" });
  revalidatePath("/settings/communication/push-notifications");
  return { ok: true };
}

export async function getInvoiceTermsAction(organizationId: string): Promise<string> {
  const stored = await getSetting<string>(organizationId, INVOICE_TERMS_KEY);
  return stored ?? "";
}

export async function updateInvoiceTermsAction(formData: FormData): Promise<ActionResult> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);
  const text = String(formData.get("terms") ?? "");
  await setSetting(organizationId, INVOICE_TERMS_KEY, text);
  revalidatePath("/settings/communication/invoice-settings");
  return { ok: true };
}
