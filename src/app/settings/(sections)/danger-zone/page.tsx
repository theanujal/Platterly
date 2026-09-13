import type { Metadata } from "next";
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Danger Zone</h1>
        <p className="text-sm text-muted-foreground">Irreversible actions. Proceed with care.</p>
      </div>
      <div className="flex max-w-lg flex-col gap-3 rounded-xl border border-destructive/30 p-4">
        <h2 className="font-medium">Delete All Data</h2>
        <p className="text-sm text-muted-foreground">
          Permanently deletes your branches, kitchens, stores, notifications, secure links, and other operational
          data. Your account, team roster, and subscription history are kept.
        </p>
        <div>
          <PurgeConfirmationDialog />
        </div>
      </div>
    </div>
  );
}
