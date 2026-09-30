"use client";

import { useState } from "react";
import { ChefHat } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateEventOperationsAction } from "../../actions";

const NO_KITCHEN = "NONE";

/**
 * Assigned kitchen (AJ, 2026-09-27). Saves the moment it changes, so there
 * is no save button. The Event Status dropdown was removed 2026-09-30: the
 * order's own status already tracks the workflow. The Event itself is created and kept in step with the
 * Order automatically (syncOrderEvent), so there's nothing to "create" here.
 */
export function EventOperationsCard({
  orderId,
  event,
  kitchens,
}: {
  orderId: string;
  event: { id: string; assignedKitchenId: string | null } | null;
  kitchens: { id: string; name: string }[];
}) {
  const [kitchenId, setKitchenId] = useState(event?.assignedKitchenId ?? NO_KITCHEN);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(patch: { assignedKitchenId?: string | null }) {
    if (!event) return;
    setState("saving");
    setError(null);
    const result = await updateEventOperationsAction(orderId, event.id, patch);
    if (!result.ok) {
      setState("error");
      setError(result.error);
      return;
    }
    setState("saved");
  }

  return (
    <Card className="gap-4 px-5 [--card-spacing:--spacing(5)]" data-testid="event-operations-card">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ChefHat className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Assigned Kitchen</h2>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Changes save automatically."}
          </p>
        </div>
      </div>

      {!event ? (
        <p className="text-sm text-muted-foreground">
          Set an Event Type on this order and save it. The event is created for you, and its kitchen shows up here.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="event-kitchen" className="shrink-0 font-normal text-muted-foreground">
              Assigned Kitchen
            </Label>
            <Select
              items={{ [NO_KITCHEN]: "Not assigned", ...Object.fromEntries(kitchens.map((k) => [k.id, k.name])) }}
              value={kitchenId}
              onValueChange={(v) => {
                const next = v ?? NO_KITCHEN;
                setKitchenId(next);
                void save({ assignedKitchenId: next === NO_KITCHEN ? null : next });
              }}
            >
              <SelectTrigger id="event-kitchen" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_KITCHEN}>Not assigned</SelectItem>
                {kitchens.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </Card>
  );
}
