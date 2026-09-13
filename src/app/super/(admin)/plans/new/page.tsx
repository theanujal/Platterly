import { requireSuperAdminOrRedirect } from "../../../_lib/guard";
import { NewPlanClient } from "./_components/new-plan-client";

// Chunk 3 Group 3.3 — create a subscription plan definition (PRD §9, §58).
export default async function NewPlanPage() {
  await requireSuperAdminOrRedirect();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <h1 className="text-lg font-semibold">New Plan</h1>
      <NewPlanClient />
    </div>
  );
}
