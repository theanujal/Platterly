import { canSee, requireActiveOrganization } from "@/lib/auth/require-session";
import { SettingsNav } from "./_components/settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { organizationId } = await requireActiveOrganization();
  // The Subscription entry shows only to roles with "Billing and Plan" (AJ, 2026-11-15).
  const showBilling = await canSee("planBilling", organizationId);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <SettingsNav showBilling={showBilling} />
      <div className="min-w-0 flex-1 p-8">{children}</div>
    </div>
  );
}
