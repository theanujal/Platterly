"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignPlanAction } from "../../actions";

interface AssignPlanProps {
  tenantId: string;
  plans: { id: string; name: string }[];
  currentPlanId?: string;
}

export function AssignPlan({ tenantId, plans, currentPlanId }: AssignPlanProps) {
  const router = useRouter();
  const [planId, setPlanId] = useState<string | undefined>(currentPlanId);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleAssign() {
    if (!planId) return;
    setError(null);
    setPending(true);
    const result = await assignPlanAction(tenantId, planId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Select value={planId} onValueChange={(value) => setPlanId(value ?? undefined)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select a plan" />
          </SelectTrigger>
          <SelectContent>
            {plans.map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>
                {plan.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" disabled={!planId || pending} onClick={handleAssign}>
          {pending ? "Assigning…" : "Assign Plan"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
