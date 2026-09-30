"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setKitchenProductionStatusAction } from "../actions";
import { KITCHEN_PRODUCTION_STATUS_LABEL } from "@/modules/menu-approvals/kitchen-production-status";
import type { KitchenProductionStatus } from "@/generated/prisma/enums";

const STAGES: KitchenProductionStatus[] = ["PENDING", "IN_PREPARATION", "READY", "DELIVERED"];

/**
 * The prep sheet's one stage control (AJ's design, 2026-09-30): a primary
 * button that moves the order to its next stage, with a chevron to jump to
 * any other. Delivered has no next stage, so it shows the chevron alone.
 */
export function StageActions({ menuSelectionId, currentStage }: { menuSelectionId: string; currentStage: KitchenProductionStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = STAGES[STAGES.indexOf(currentStage) + 1] as KitchenProductionStatus | undefined;

  function move(stage: KitchenProductionStatus) {
    setError(null);
    startTransition(async () => {
      const result = await setKitchenProductionStatusAction(menuSelectionId, stage);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex">
        {next && (
          <Button className="rounded-r-none" disabled={pending} onClick={() => move(next)}>
            Mark as {KITCHEN_PRODUCTION_STATUS_LABEL[next]}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button aria-label="Change stage" disabled={pending} className={next ? "rounded-l-none border-l-primary-foreground/30 px-2.5" : ""} />}
          >
            {!next && "Delivered"}
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {STAGES.map((stage) => (
              <DropdownMenuItem key={stage} disabled={stage === currentStage} onClick={() => move(stage)}>
                {KITCHEN_PRODUCTION_STATUS_LABEL[stage]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
