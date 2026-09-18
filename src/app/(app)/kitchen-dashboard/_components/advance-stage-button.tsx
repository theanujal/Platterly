"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { advanceKitchenProductionStatusAction } from "../actions";
import type { KitchenProductionStatus } from "@/generated/prisma/enums";

const NEXT_STAGE_LABEL: Partial<Record<KitchenProductionStatus, string>> = {
  PENDING: "Start Preparing",
  PREPARING: "Mark Ready",
  READY: "Mark Completed",
};

interface AdvanceStageButtonProps {
  menuSelectionId: string;
  currentStage: KitchenProductionStatus;
}

export function AdvanceStageButton({ menuSelectionId, currentStage }: AdvanceStageButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = NEXT_STAGE_LABEL[currentStage];
  if (!label) return null;

  async function handleClick() {
    setError(null);
    setPending(true);
    const result = await advanceKitchenProductionStatusAction(menuSelectionId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      {/*
        h-[38px] — matches the Trial Upsell Card's "Upgrade Now" button
        (components/app-shell/upgrade-card.tsx has the full explanation).
        Per the approved design doc, not size="sm" (pill-looking) or
        size="default" (overshoots the 38px spec).
      */}
      <Button type="button" className="h-[38px] w-full" disabled={pending} onClick={handleClick}>
        {pending ? "Updating…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
