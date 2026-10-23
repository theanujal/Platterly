import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getChannelSettings } from "@/modules/notifications/channel-settings";
import { kitchenWhatsAppPhone } from "@/modules/notifications/triggers";
import { formatPhoneDisplay } from "@/lib/phone";
import { ChannelPreferences, ChannelServiceStatus } from "../../../_components/channel-settings-ui";
import { InfoList, PanelHeader, SettingsCard, SettingsPanel } from "../../../_components/settings-ui";

export const metadata: Metadata = {
  title: "WhatsApp Settings — Caterly",
  robots: { index: false, follow: false },
};

// Sent by Platterly (Ops) about the kitchen's own plan; always on, like account emails (Sharath, 2026-10-23).
const BILLING_MESSAGES = [
  "A week before your plan renews",
  "On the day your plan renews",
  "Payment received",
  "Auto-pay did not go through",
  "Plan ended: days left to renew",
  "Account locked",
];

export default async function WhatsappSettingsPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["view"] }, organizationId);
  const [settings, phone] = await Promise.all([getChannelSettings(organizationId, "whatsapp"), kitchenWhatsAppPhone(organizationId)]);

  return (
    <SettingsCard title="WhatsApp Settings" description="WhatsApp messages go to your kitchen's own team, never to your customers.">
      <p className="text-sm text-muted-foreground">
        {phone ? <>Messages go to <strong className="text-foreground">{formatPhoneDisplay(phone)}</strong>. </> : <>No mobile number yet. </>}
        <Link href="/settings/account/business-profile" className="underline underline-offset-4">
          Change it in Business profile
        </Link>
        .
      </p>
      <ChannelServiceStatus channel="whatsapp" providerConnected={settings.providerConnected} active={settings.active} />
      <ChannelPreferences key={String(settings.active)} disabled={!settings.active} channel="whatsapp" title="Notification Preferences" description="Choose which WhatsApp messages to send to your kitchen" messages={settings.messages} saveLabel="Save WhatsApp Settings" />
      <SettingsPanel>
        <PanelHeader icon={Receipt} title="Billing messages (always on)" description="Platterly sends these about your own plan. They can't be switched off." />
        <div className="text-sm">
          <InfoList items={BILLING_MESSAGES} />
        </div>
      </SettingsPanel>
    </SettingsCard>
  );
}
