import { requireSuperAdminOrRedirect } from "../../../_lib/guard";
import { PageHeader } from "../../_components/page-header";
import { NewPlanClient } from "./_components/new-plan-client";

// Chunk 3 Group 3.3 — create a subscription plan definition (PRD §9, §58).
export default async function NewPlanPage() {
  await requireSuperAdminOrRedirect();

  return (
    <>
      <PageHeader crumbs={[{ label: "Catering" }, { label: "Plans", href: "/super/plans" }, { label: "New Plan" }]} title="New Plan" description="Define a subscription plan caterers can be assigned to." />
      <div className="flex max-w-2xl flex-col gap-6">
        <NewPlanClient />
      </div>
    </>
  );
}
