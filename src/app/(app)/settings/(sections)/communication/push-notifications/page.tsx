import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/require-session";
import { getPushState, vapidPublicKey } from "@/modules/notifications/push";
import { PushSettings } from "../../../_components/push-settings";
import { SettingsCard } from "../../../_components/settings-ui";

export const metadata: Metadata = {
  title: "Push Notifications — Platterly",
  robots: { index: false, follow: false },
};

export default async function PushNotificationsPage() {
  const session = await requireSession();
  const state = await getPushState(session.user.id);

  return (
    <SettingsCard title="Push Notifications" description="Configure push notifications to stay updated on your catering events.">
      <PushSettings enabled={state.enabled} devices={state.devices} vapidPublicKey={vapidPublicKey()} />
    </SettingsCard>
  );
}
