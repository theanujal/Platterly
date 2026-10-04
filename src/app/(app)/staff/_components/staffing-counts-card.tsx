"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STAFF_DUTIES, STAFF_DUTY_LABEL } from "@/modules/employees/duty";
import { MAX_STAFF_COUNT } from "@/modules/employees/staff-count-limits";
import type { StaffDuty } from "@/generated/prisma/enums";
import { saveStaffCountsAction } from "../event-ops-actions";

/**
 * Staffing as numbers only (AJ, 2026-10-04): how many people the event needs for each duty, such as Event Manager 2 and
 * Serving 10. Nobody is picked by name. A blank box is zero.
 */
export function StaffingCountsCard({ orderId, eventId, initial, canEdit }: { orderId: string | null; eventId: string; initial: Record<StaffDuty, number>; canEdit: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(STAFF_DUTIES.map((d) => [d, initial[d] ? String(initial[d]) : ""])));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const total = STAFF_DUTIES.reduce((sum, d) => sum + (Number(values[d]) || 0), 0);

  async function save() {
    setState("saving");
    setError(null);
    const counts = Object.fromEntries(STAFF_DUTIES.map((d) => [d, values[d].trim() === "" ? 0 : Number(values[d])]));
    const result = await saveStaffCountsAction(orderId, eventId, counts);
    if (!result.ok) {
      setState("error");
      setError(result.error);
      return;
    }
    setState("saved");
  }

  return (
    <Card data-testid="staffing-counts-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          Staffing ({total} {total === 1 ? "person" : "people"})
        </CardTitle>
        <CardDescription>How many people this event needs for each duty. Just the numbers, no names.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          {STAFF_DUTIES.map((duty) => (
            <div key={duty} className="flex flex-col gap-1.5">
              <Label htmlFor={`staff-${duty}`}>{STAFF_DUTY_LABEL[duty]}</Label>
              <Input
                id={`staff-${duty}`}
                type="number"
                inputMode="numeric"
                min="0"
                max={MAX_STAFF_COUNT}
                step="1"
                placeholder="0"
                disabled={!canEdit}
                value={values[duty]}
                onChange={(e) => {
                  setValues((previous) => ({ ...previous, [duty]: e.target.value }));
                  setState("idle");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (canEdit) void save();
                  }
                }}
              />
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {canEdit && (
          <div className="flex items-center gap-3">
            <Button type="button" size="md" onClick={() => void save()} disabled={state === "saving"}>
              {state === "saving" ? "Saving…" : "Save staffing"}
            </Button>
            {state === "saved" && (
              <span role="status" className="text-sm text-success">
                Saved.
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
