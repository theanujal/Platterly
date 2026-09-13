"use client";

import { useRouter } from "next/navigation";
import { PlanForm, valuesToPlanInput } from "../../_components/plan-form";
import { createPlanAction } from "../../actions";

export function NewPlanClient() {
  const router = useRouter();

  return (
    <PlanForm
      includeCode
      submitLabel="Create plan"
      onSubmit={(values) => createPlanAction(valuesToPlanInput(values))}
      onSuccess={() => router.push("/super/plans")}
    />
  );
}
