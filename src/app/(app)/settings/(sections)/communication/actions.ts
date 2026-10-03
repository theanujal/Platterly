"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getSetting, setSetting } from "@/lib/settings/settings";
import {
  ChannelProviderNotConnectedError,
  InvalidChannelTemplateError,
  setChannelActive,
  setChannelMessages,
  setChannelTemplate,
} from "@/modules/notifications/channel-settings";
import type { MessageKey, SettingsChannel } from "@/modules/notifications/channel-settings-config";

export type ActionResult = { ok: true } | { ok: false; error: string };

const INVOICE_TERMS_KEY = "communication.invoiceTerms";

const PAGE: Record<SettingsChannel, string> = {
  whatsapp: "/settings/communication/whatsapp-settings",
  email: "/settings/communication/email-settings",
  push: "/settings/communication/push-notifications",
};

async function guarded(channel: SettingsChannel, run: (organizationId: string) => Promise<void>): Promise<ActionResult> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);
  try {
    await run(organizationId);
  } catch (error) {
    if (error instanceof ChannelProviderNotConnectedError || error instanceof InvalidChannelTemplateError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath(PAGE[channel]);
  return { ok: true };
}

/** The caterer's activate / deactivate switch. Connecting the provider itself is the Platterly team's job. */
export async function setChannelActiveAction(channel: SettingsChannel, active: boolean): Promise<ActionResult> {
  return guarded(channel, (organizationId) => setChannelActive(organizationId, channel, active));
}

export async function saveChannelMessagesAction(channel: SettingsChannel, messages: Partial<Record<MessageKey, boolean>>): Promise<ActionResult> {
  return guarded(channel, (organizationId) => setChannelMessages(organizationId, channel, messages));
}

export async function saveChannelTemplateAction(channel: SettingsChannel, templateKey: string, body: string): Promise<ActionResult> {
  return guarded(channel, (organizationId) => setChannelTemplate(organizationId, channel, templateKey, body));
}

export async function getInvoiceTermsAction(): Promise<string> {
  const { organizationId } = await requireActiveOrganization();
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
