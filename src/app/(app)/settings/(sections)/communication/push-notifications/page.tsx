import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { getChannelSettings } from "@/modules/notifications/channel-settings";
import { ChannelPreferences } from "../../../_components/channel-settings-ui";
import { SettingsCard } from "../../../_components/settings-ui";

export const metadata: Metadata = {
  title: "Push Notifications — Platterly",
  robots: { index: false, follow: false },
};

export default async function PushNotificationsPage() {
  const { organizationId } = await requireActiveOrganization();
  const settings = await getChannelSettings(organizationId, "push");

  return (
    <SettingsCard title="Push Notifications" description="Configure push notifications to stay updated on your catering events.">
      <ChannelPreferences
        channel="push"
        title="Push Notification Preferences"
        description="Choose which push notifications you want to receive"
        messages={settings.messages}
        saveLabel="Save Notification Settings"
      />
    </SettingsCard>
  );
}
