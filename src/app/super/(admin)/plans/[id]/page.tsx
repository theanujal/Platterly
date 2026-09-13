import { notFound } from "next/navigation";
import { requireSuperAdminOrRedirect } from "../../../_lib/guard";
import { getPlan } from "@/modules/subscriptions/plan";
import { EditPlanClient } from "./_components/edit-plan-client";

// Chunk 3 Group 3.3 — edit a subscription plan definition.
export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdminOrRedirect();
  const { id } = await params;
  const plan = await getPlan(id);
  if (!plan) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-lg font-semibold">{plan.name}</h1>
      <EditPlanClient
        planId={plan.id}
        initialValues={{
          code: plan.code,
          name: plan.name,
          description: plan.description ?? "",
          isTrial: plan.isTrial,
          trialDurationDays: plan.trialDurationDays?.toString() ?? "",
          priceMonthly: plan.priceMonthly?.toString() ?? "",
          priceAnnual: plan.priceAnnual?.toString() ?? "",
          currency: plan.currency,
          maxUsers: plan.maxUsers?.toString() ?? "",
          maxEvents: plan.maxEvents?.toString() ?? "",
          maxOrders: plan.maxOrders?.toString() ?? "",
          maxKitchens: plan.maxKitchens?.toString() ?? "",
          maxStores: plan.maxStores?.toString() ?? "",
          maxCustomers: plan.maxCustomers?.toString() ?? "",
          maxMenuLinks: plan.maxMenuLinks?.toString() ?? "",
          maxStorageMb: plan.maxStorageMb?.toString() ?? "",
          maxReports: plan.maxReports?.toString() ?? "",
          maxWhatsappMessages: plan.maxWhatsappMessages?.toString() ?? "",
        }}
      />
    </div>
  );
}
