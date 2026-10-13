import "server-only";
import { getSetting, setSetting } from "@/lib/settings/settings";
import { CHANNEL_CONFIG, type ChannelSettings, type MessageKey, type SettingsChannel } from "./channel-settings-config";

/**
 * Per-tenant WhatsApp / Email / Push settings (AJ, 2026-09-30). The provider is
 * connected by the Platterly team from the (not yet built) admin dashboard:
 * that writes `providerConnected` through `setChannelProviderConnected`. The
 * caterer only activates or deactivates the channel and picks which messages
 * go out. Email is the exception (AJ, 2026-10-04): it is sent from Platterly's own ZeptoMail account, so it is
 * connected for every kitchen unless the Platterly team switches it off (the kill switch on the caterer's page).
 */

const settingsKey = (channel: SettingsChannel) => `notifications.${channel}`;
const providerKey = (channel: SettingsChannel) => `notifications.${channel}.provider`;

interface StoredSettings {
  active?: boolean;
  messages?: Partial<Record<MessageKey, boolean>>;
}

export class ChannelProviderNotConnectedError extends Error {}

export async function getChannelSettings(organizationId: string, channel: SettingsChannel): Promise<ChannelSettings> {
  const [stored, provider] = await Promise.all([
    getSetting<StoredSettings>(organizationId, settingsKey(channel)),
    getSetting<{ connected?: boolean }>(organizationId, providerKey(channel)),
  ]);
  const config = CHANNEL_CONFIG[channel];
  // Email and WhatsApp are both sent from Platterly's own accounts, so they are connected for every kitchen unless the Platterly team switches one off.
  const providerConnected = !config.hasService ? true : provider?.connected !== false;

  const messages: ChannelSettings["messages"] = {};
  // Email (kitchen -> customer) and WhatsApp (to the kitchen) are on until the kitchen switches a message off; the other channels start off.
  for (const message of config.messages) messages[message.key] = message.available && (channel === "email" || channel === "whatsapp" ? stored?.messages?.[message.key] !== false : stored?.messages?.[message.key] === true);

  // A caterer can't stay active once the provider is disconnected.
  const active = channel === "email" || channel === "whatsapp" ? stored?.active !== false : stored?.active === true;
  return { providerConnected, active: providerConnected && active, messages };
}

async function update(organizationId: string, channel: SettingsChannel, change: (stored: StoredSettings) => StoredSettings) {
  const stored = (await getSetting<StoredSettings>(organizationId, settingsKey(channel))) ?? {};
  await setSetting(organizationId, settingsKey(channel), change(stored) as never);
}

export async function setChannelActive(organizationId: string, channel: SettingsChannel, active: boolean) {
  const { providerConnected } = await getChannelSettings(organizationId, channel);
  if (active && !providerConnected) {
    throw new ChannelProviderNotConnectedError(`${CHANNEL_CONFIG[channel].label} isn't connected yet. The Platterly team connects it for you.`);
  }
  // Email and WhatsApp each have one master switch over their messages: turning it off turns every message off, turning
  // it on turns every message on, and the kitchen then decides one by one.
  const all = channel === "email" || channel === "whatsapp" ? Object.fromEntries(CHANNEL_CONFIG[channel].messages.filter((m) => m.available).map((m) => [m.key, active])) : null;
  await update(organizationId, channel, (stored) => ({ ...stored, active, ...(all ? { messages: all } : {}) }));
}

export async function setChannelMessages(organizationId: string, channel: SettingsChannel, messages: Partial<Record<MessageKey, boolean>>) {
  const allowed = new Set(CHANNEL_CONFIG[channel].messages.filter((m) => m.available).map((m) => m.key));
  const clean: Partial<Record<MessageKey, boolean>> = {};
  for (const [key, value] of Object.entries(messages) as [MessageKey, boolean][]) if (allowed.has(key)) clean[key] = value === true;
  await update(organizationId, channel, (stored) => ({ ...stored, messages: clean }));
}

/** Called from the admin dashboard (Chunk 16 / Super Admin), never from a caterer-facing page. Disconnecting also deactivates. */
export async function setChannelProviderConnected(organizationId: string, channel: SettingsChannel, connected: boolean) {
  await setSetting(organizationId, providerKey(channel), { connected });
  if (!connected) await update(organizationId, channel, (stored) => ({ ...stored, active: false }));
}
