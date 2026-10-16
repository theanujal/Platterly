"use client";

import { useState } from "react";
import { ChefHat, ConciergeBell, Info, Settings, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { STAFF_DUTIES, STAFF_DUTY_LABEL } from "@/modules/employees/duty";
import { MAX_STAFF_COUNT } from "@/modules/employees/staff-count-limits";
import type { StaffDuty } from "@/generated/prisma/enums";
import { SummaryCard } from "../../orders/_components/order-form-parts";
import { saveStaffCountsAction } from "../event-ops-actions";

/** An icon per duty, so the three numbers read at a glance. */
const DUTY_ICON: Partial<Record<StaffDuty, LucideIcon>> = { KITCHEN: ChefHat, SERVING: ConciergeBell, SETUP: Settings };

/**
 * Staffing (AJ, 2026-10-14): the Event Manager is picked from team members with access and staff whose duty is Event Manager (AJ, 2026-10-16); Cooking, Serving and Setup are numbers
 * only. A blank box is zero. The Staff page and the order's Staffing tab both use this card, so they always agree.
 */
export function StaffingCountsCard({ orderId, eventId, initial, eventManager, suggestions, canEdit }: { orderId: string | null; eventId: string; initial: Record<StaffDuty, number>; eventManager: string; suggestions: string[]; canEdit: boolean }) {
  const [manager, setManager] = useState(eventManager);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(STAFF_DUTIES.map((d) => [d, initial[d] ? String(initial[d]) : ""])));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const total = STAFF_DUTIES.reduce((sum, d) => sum + (Number(values[d]) || 0), 0) + (manager.trim() ? 1 : 0);

  async function save() {
    setState("saving");
    setError(null);
    const counts = Object.fromEntries(STAFF_DUTIES.map((d) => [d, values[d].trim() === "" ? 0 : Number(values[d])]));
    const result = await saveStaffCountsAction(orderId, eventId, counts, manager);
    if (!result.ok) {
      setState("error");
      setError(result.error);
      return;
    }
    setState("saved");
  }

  return (
    <div data-testid="staffing-counts-card" className="@container min-w-0">
      <SummaryCard
        icon={Users}
        title={`Staffing (${total} ${total === 1 ? "person" : "people"})`}
        description="Assign the event manager and enter the number of people needed for cooking, serving and setup."
      >
        {/* Full width card: the Event Manager and the note on the left, a divider, the staff counts as three tiles on the right (stacked on a narrow card). */}
        <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.3fr)]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label className="text-base font-semibold">Event Manager</Label>
              <SearchableSelect
                aria-label="Event Manager"
                disabled={!canEdit}
                placeholder="Select event manager"
                searchPlaceholder="Search team members and Event Managers…"
                emptyLabel="No team member or Event Manager staff found. Add a staff member with the duty Event Manager."
                options={(eventManager && !suggestions.includes(eventManager) ? [eventManager, ...suggestions] : suggestions).map((name) => ({ value: name, label: name }))}
                value={manager}
                onValueChange={(v) => {
                  setManager(v.slice(0, 100));
                  setState("idle");
                }}
              />
            </div>
            <p className="flex items-start gap-3 rounded-lg bg-info/10 p-4 text-sm text-info">
              <Info className="mt-0.5 size-5 shrink-0" />
              <span>These numbers help with kitchen planning and on-site coordination. You can update them later if needed.</span>
            </p>
          </div>

          <div className="hidden w-px bg-border @3xl:block" aria-hidden />

          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-base font-semibold">Staff Count</h3>
              <p className="text-sm text-muted-foreground">Enter how many people are needed for each activity.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 @sm:grid-cols-3">
              {STAFF_DUTIES.map((duty) => {
                const Icon = DUTY_ICON[duty] ?? Users;
                return (
                  <div key={duty} className="flex flex-col gap-3 rounded-xl border border-border p-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <Label htmlFor={`staff-${duty}`} className="text-base">{STAFF_DUTY_LABEL[duty]}</Label>
                    </div>
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
                );
              })}
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {canEdit && (
          <div className="flex items-center gap-3 border-t border-border pt-5">
            <Button type="button" onClick={() => void save()} disabled={state === "saving"}>
              {state === "saving" ? "Saving…" : "Save staffing"}
            </Button>
            {state === "saved" && (
              <span role="status" className="text-sm text-success">
                Saved.
              </span>
            )}
          </div>
        )}
      </SummaryCard>
    </div>
  );
}
