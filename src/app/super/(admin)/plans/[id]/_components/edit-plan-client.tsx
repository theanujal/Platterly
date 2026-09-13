"use client";

import { useRouter } from "next/navigation";
import { PlanForm, valuesToPlanInput, type PlanFormValues } from "../../_components/plan-form";
import { updatePlanAction } from "../../actions";

export function EditPlanClient({
  planId,
  initialValues,
}: {
  planId: string;
  initialValues: Partial<PlanFormValues>;
}) {
  const router = useRouter();

  return (
    <PlanForm
      initialValues={initialValues}
      submitLabel="Save changes"
      onSubmit={(values) => {
        const input = valuesToPlanInput(values);
        return updatePlanAction(planId, {
          name: input.name,
          description: input.description,
          isTrial: input.isTrial,
          trialDurationDays: input.trialDurationDays,
          priceMonthly: input.priceMonthly,
          priceAnnual: input.priceAnnual,
          currency: input.currency,
          maxUsers: input.maxUsers,
          maxEvents: input.maxEvents,
          maxOrders: input.maxOrders,
          maxKitchens: input.maxKitchens,
          maxStores: input.maxStores,
          maxCustomers: input.maxCustomers,
          maxMenuLinks: input.maxMenuLinks,
          maxStorageMb: input.maxStorageMb,
          maxReports: input.maxReports,
          maxWhatsappMessages: input.maxWhatsappMessages,
        });
      }}
      onSuccess={() => router.push("/super/plans")}
    />
  );
}
