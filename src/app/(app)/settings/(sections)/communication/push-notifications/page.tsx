import type { Metadata } from "next";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { getPushToggleAction } from "../actions";
import { PushToggleForm } from "./_components/push-toggle-form";

export const metadata: Metadata = {
  title: "Push Notifications — Platterly",
  robots: { index: false, follow: false },
};

export default async function PushNotificationsPage() {
  const { organizationId } = await requireActiveOrganization();
  const enabled = await getPushToggleAction(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings", href: "/settings" }, { label: "Push Notifications" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Push Notifications</h1>
        <p className="text-sm text-muted-foreground">Control whether push notifications are sent.</p>
      </div>
      <PushToggleForm initialEnabled={enabled} />
    </div>
  );
}
