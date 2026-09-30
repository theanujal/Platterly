import type { Metadata } from "next";
import { SettingsCard } from "../../_components/settings-ui";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { PurgeConfirmationDialog } from "./_components/purge-confirmation-dialog";

export const metadata: Metadata = {
  title: "Danger Zone — Platterly",
  robots: { index: false, follow: false },
};

export default async function DangerZonePage() {
  const { organizationId } = await requireActiveOrganization();
  // Owner-only — even the owner-level `admin` role is denied here.
  await requirePermission({ tenant: ["delete"] }, organizationId);

  return (
    <SettingsCard title="Danger Zone" description="Irreversible actions. Proceed with care.">
      <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <h2 className="font-medium">Delete All Data</h2>
        <p className="text-sm text-muted-foreground">
          Permanently deletes your branches, kitchens, stores, notifications, secure links, and other operational
          data. Your account, team roster, and subscription history are kept.
        </p>
        <div>
          <PurgeConfirmationDialog />
        </div>
      </div>
    </SettingsCard>
  );
}
