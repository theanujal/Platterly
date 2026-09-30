"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { useStopEditing } from "../../../../_components/editable-panel";
import { FormFooter } from "../../../../_components/settings-ui";
import { updateKitchenRulesAction } from "../actions";
import type { KitchenRules } from "@/modules/menu-approvals/kitchen-production-status";

export function KitchenRulesForm({ initialValues }: { initialValues: KitchenRules }) {
  const router = useRouter();
  const stopEditing = useStopEditing();
  const [extraPercent, setExtraPercent] = useState(String(initialValues.extraPercent));
  const [daysBeforeEvent, setDaysBeforeEvent] = useState(String(initialValues.daysBeforeEvent));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("extraPercent", extraPercent);
    formData.set("daysBeforeEvent", daysBeforeEvent);
    const result = await updateKitchenRulesAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    stopEditing();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="kitchen-extra-percent">Extra quantity to cook (%)</Label>
        <IconInput
          icon={Percent}
          id="kitchen-extra-percent"
          type="number"
          required
          min={0}
          max={100}
          step="1"
          value={extraPercent}
          onChange={(e) => setExtraPercent(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          The kitchen cooks this much more than the guest count, for wastage and second helpings. Shown as Cook Qty on the preparation sheet. Default 10.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="kitchen-days-before">Send to the kitchen (days before the event)</Label>
        <IconInput
          icon={CalendarClock}
          id="kitchen-days-before"
          type="number"
          required
          min={0}
          max={30}
          step="1"
          value={daysBeforeEvent}
          onChange={(e) => setDaysBeforeEvent(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          An approved order appears on the Kitchen Dashboard this many days before its event date. Default 2, so orders for today through 2 days ahead show up.
        </p>
      </div>
      <FormFooter error={error}>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={stopEditing}>
          Cancel
        </Button>
      </FormFooter>
    </form>
  );
}
