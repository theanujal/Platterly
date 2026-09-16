import type { Metadata } from "next";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { getSmsToggleAction } from "../actions";
import { SmsToggleForm } from "./_components/sms-toggle-form";

export const metadata: Metadata = {
  title: "SMS Settings — Platterly",
  robots: { index: false, follow: false },
};

export default async function SmsSettingsPage() {
  const { organizationId } = await requireActiveOrganization();
  const enabled = await getSmsToggleAction(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings", href: "/settings" }, { label: "SMS Settings" }]} />
      <div>
        <h1 className="text-2xl font-semibold">SMS Settings</h1>
        <p className="text-sm text-muted-foreground">Control whether SMS notifications are sent.</p>
      </div>
      <SmsToggleForm initialEnabled={enabled} />
    </div>
  );
}
