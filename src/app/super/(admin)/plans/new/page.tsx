import { requireSuperAdminOrRedirect } from "../../../_lib/guard";
import { NewPlanClient } from "./_components/new-plan-client";

// Chunk 3 Group 3.3 — create a subscription plan definition (PRD §9, §58).
export default async function NewPlanPage() {
  await requireSuperAdminOrRedirect();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">New Plan</h1>
        <p className="text-sm text-neutral-500">Define a subscription plan tenants can be assigned to.</p>
      </div>
      <NewPlanClient />
    </div>
  );
}
