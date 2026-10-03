import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getChannelSettings } from "@/modules/notifications/channel-settings";
import { ChannelPreferences, ChannelServiceStatus, ChannelTemplates } from "../../../_components/channel-settings-ui";
import { SettingsCard } from "../../../_components/settings-ui";

export const metadata: Metadata = {
  title: "WhatsApp Settings — Platterly",
  robots: { index: false, follow: false },
};

export default async function WhatsappSettingsPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["view"] }, organizationId);
  const settings = await getChannelSettings(organizationId, "whatsapp");

  return (
    <SettingsCard title="WhatsApp Settings" description="Configure WhatsApp notifications and message templates.">
      <ChannelServiceStatus channel="whatsapp" providerConnected={settings.providerConnected} active={settings.active} />
      <ChannelPreferences channel="whatsapp" title="Notification Preferences" description="Choose which WhatsApp messages to send to your customers" messages={settings.messages} saveLabel="Save WhatsApp Settings" />
      <ChannelTemplates channel="whatsapp" templates={settings.templates} />
    </SettingsCard>
  );
}
