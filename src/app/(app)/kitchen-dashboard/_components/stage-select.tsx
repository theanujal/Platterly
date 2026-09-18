"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setKitchenProductionStatusAction } from "../actions";
import { KITCHEN_PRODUCTION_STATUS_LABEL } from "@/modules/menu-approvals/kitchen-production-status";
import type { KitchenProductionStatus } from "@/generated/prisma/enums";

// Same 5-tone legend as Badge's neutral/info/warning/success/danger
// variants (AJ, 2026-09-19) — this control IS a status badge, just an
// interactive one, so it keeps the pill shape reserved for badges rather
// than the app's rounded-lg button shape.
const STAGE_STYLE: Record<KitchenProductionStatus, string> = {
  PENDING: "bg-secondary text-secondary-foreground",
  PREPARING: "bg-warning/10 text-warning",
  READY: "bg-info/10 text-info",
  COMPLETED: "bg-success/10 text-success",
  CANCELLED: "bg-destructive/10 text-destructive",
};

const STAGE_OPTIONS = Object.keys(KITCHEN_PRODUCTION_STATUS_LABEL) as KitchenProductionStatus[];

interface StageSelectProps {
  menuSelectionId: string;
  currentStage: KitchenProductionStatus;
}

export function StageSelect({ menuSelectionId, currentStage }: StageSelectProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(currentStage);

  function handleChange(value: string | null) {
    if (!value || value === stage) return;
    const next = value as KitchenProductionStatus;
    setError(null);
    const previous = stage;
    setStage(next);
    startTransition(async () => {
      const result = await setKitchenProductionStatusAction(menuSelectionId, next);
      if (!result.ok) {
        setStage(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Select
        items={KITCHEN_PRODUCTION_STATUS_LABEL}
        value={stage}
        onValueChange={handleChange}
        disabled={pending}
      >
        <SelectTrigger
          size="sm"
          aria-label="Kitchen production stage"
          className={`rounded-full border-transparent px-3 font-medium ${STAGE_STYLE[stage]}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAGE_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {KITCHEN_PRODUCTION_STATUS_LABEL[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
