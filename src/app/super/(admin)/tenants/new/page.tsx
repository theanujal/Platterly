import { requireSuperAdminOrRedirect } from "../../../_lib/guard";
import { NewTenantClient } from "./_components/new-tenant-client";

// Chunk 3 Group 3.2 — Super Admin "Create caterer" (PRD §8.2). Creates the
// Organization/business-profile record only — no owner login is provisioned
// here; that's Chunk 4's self-serve onboarding job.
export default async function NewTenantPage() {
  await requireSuperAdminOrRedirect();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <h1 className="text-lg font-semibold">New Caterer</h1>
      <NewTenantClient />
    </div>
  );
}
