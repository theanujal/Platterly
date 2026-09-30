import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { getChannelSettings } from "@/modules/notifications/channel-settings";
import { ChannelPreferences, ChannelServiceStatus, ChannelTemplates } from "../../../_components/channel-settings-ui";
import { SettingsCard } from "../../../_components/settings-ui";

export const metadata: Metadata = {
  title: "Email Settings — Platterly",
  robots: { index: false, follow: false },
};

export default async function EmailSettingsPage() {
  const { organizationId } = await requireActiveOrganization();
  const settings = await getChannelSettings(organizationId, "email");

  return (
    <SettingsCard title="Email Settings" description="Configure email notifications and message templates.">
      <ChannelServiceStatus channel="email" providerConnected={settings.providerConnected} active={settings.active} />
      <ChannelPreferences channel="email" title="Notification Preferences" description="Choose which email notifications to send to your customers" messages={settings.messages} saveLabel="Save Email Settings" />
      <ChannelTemplates channel="email" templates={settings.templates} />
    </SettingsCard>
  );
}
