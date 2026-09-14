import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { NewAddOnClient } from "./_components/new-addon-client";

export default async function NewAddOnPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["create"] }, organizationId);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div>
        <h1 className="text-lg font-semibold">New Add-on</h1>
        <p className="text-sm text-muted-foreground">Add a live counter or special add-on.</p>
      </div>
      <NewAddOnClient />
    </div>
  );
}
