import "server-only";
import { getSetting, setSetting } from "@/lib/settings/settings";
import { CHANNEL_CONFIG, type ChannelSettings, type MessageKey, type SettingsChannel } from "./channel-settings-config";

/**
 * Per-tenant WhatsApp / Email / Push settings (AJ, 2026-09-30). The provider is
 * connected by the Platterly team from the (not yet built) admin dashboard:
 * that writes `providerConnected` through `setChannelProviderConnected`. The
 * caterer only activates or deactivates the channel and picks which messages
 * go out. Nothing sends yet: the providers land in Chunk 16 and read these.
 */

const settingsKey = (channel: SettingsChannel) => `notifications.${channel}`;
const providerKey = (channel: SettingsChannel) => `notifications.${channel}.provider`;

interface StoredSettings {
  active?: boolean;
  messages?: Partial<Record<MessageKey, boolean>>;
  templates?: Record<string, string>;
}

export class ChannelProviderNotConnectedError extends Error {}
export class InvalidChannelTemplateError extends Error {}

export async function getChannelSettings(organizationId: string, channel: SettingsChannel): Promise<ChannelSettings> {
  const [stored, provider] = await Promise.all([
    getSetting<StoredSettings>(organizationId, settingsKey(channel)),
    getSetting<{ connected?: boolean }>(organizationId, providerKey(channel)),
  ]);
  const config = CHANNEL_CONFIG[channel];
  const providerConnected = config.hasService ? provider?.connected === true : true;

  const messages: ChannelSettings["messages"] = {};
  for (const message of config.messages) messages[message.key] = message.available && stored?.messages?.[message.key] === true;

  const templates: ChannelSettings["templates"] = {};
  for (const template of config.templates) templates[template.key] = stored?.templates?.[template.key]?.trim() ? stored.templates[template.key] : template.defaultBody;

  // A caterer can't stay active once the provider is disconnected.
  return { providerConnected, active: providerConnected && stored?.active === true, messages, templates };
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
  await update(organizationId, channel, (stored) => ({ ...stored, active }));
}

export async function setChannelMessages(organizationId: string, channel: SettingsChannel, messages: Partial<Record<MessageKey, boolean>>) {
  const allowed = new Set(CHANNEL_CONFIG[channel].messages.filter((m) => m.available).map((m) => m.key));
  const clean: Partial<Record<MessageKey, boolean>> = {};
  for (const [key, value] of Object.entries(messages) as [MessageKey, boolean][]) if (allowed.has(key)) clean[key] = value === true;
  await update(organizationId, channel, (stored) => ({ ...stored, messages: clean }));
}

export async function setChannelTemplate(organizationId: string, channel: SettingsChannel, templateKey: string, body: string) {
  if (!CHANNEL_CONFIG[channel].templates.some((t) => t.key === templateKey)) throw new InvalidChannelTemplateError("Unknown template.");
  if (!body.trim()) throw new InvalidChannelTemplateError("A template can't be empty.");
  if (body.length > 1000) throw new InvalidChannelTemplateError("Keep the template under 1000 characters.");
  await update(organizationId, channel, (stored) => ({ ...stored, templates: { ...stored.templates, [templateKey]: body } }));
}

/** Called from the admin dashboard (Chunk 16 / Super Admin), never from a caterer-facing page. Disconnecting also deactivates. */
export async function setChannelProviderConnected(organizationId: string, channel: SettingsChannel, connected: boolean) {
  await setSetting(organizationId, providerKey(channel), { connected });
  if (!connected) await update(organizationId, channel, (stored) => ({ ...stored, active: false }));
}
