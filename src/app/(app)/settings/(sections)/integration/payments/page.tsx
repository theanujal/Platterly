import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { originFor } from "@/lib/routing/hosts";
import { getPaymentSettingsView } from "@/modules/payments/payment-settings";
import { SettingsCard } from "../../../_components/settings-ui";
import { PaymentsSettings } from "./_components/payments-settings";

export const metadata: Metadata = {
  title: "Payments — Platterly",
  robots: { index: false, follow: false },
};

export default async function PaymentsSettingsPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["view"] }, organizationId);
  const settings = await getPaymentSettingsView(organizationId);
  const webhookUrl = `${originFor("catering")}/api/webhooks/razorpay/${organizationId}`;

  return (
    <SettingsCard title="Payments" description="How your customers pay you. Money goes straight to your own account; Platterly never holds it.">
      <PaymentsSettings settings={settings} webhookUrl={webhookUrl} />
    </SettingsCard>
  );
}
