"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAFF_DUTIES, STAFF_DUTY_LABEL } from "@/modules/employees/duty";
import { assignStaffAction, removeAssignmentAction, updateAssignmentAction } from "../../../staff/actions";

export interface StaffingData {
  assignments: { id: string; name: string; duty: string; notes: string | null; hasLogin: boolean; phone: string | null; staffMemberId: string | null; memberId: string | null }[];
  /** People that can still be added: floor staff (no login) and team members (login). */
  floorStaff: { id: string; name: string; defaultDuty: string }[];
  teamMembers: { id: string; name: string }[];
}

/**
 * Who is on this event. The kitchen team fills it in by hand (AJ, 2026-10-04): there are no suggested counts, no
 * required roles and no understaffed warning. The only note shown is when someone is also booked on an overlapping event.
 */
export function StaffingCard({ orderId, eventId, data, canAdd, canEdit, canRemove }: { orderId: string | null; eventId: string | null; data: StaffingData; canAdd: boolean; canEdit: boolean; canRemove: boolean }) {
  const router = useRouter();
  const [person, setPerson] = useState("");
  const [duty, setDuty] = useState("SERVING");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<{ label: string; orderId: string | null }[] | null>(null);
  const [pending, setPending] = useState(false);

  if (!eventId) {
    return (
      <Card data-testid="staffing-card">
        <CardContent className="pt-6 text-sm text-muted-foreground">Choose an event type on the order to create its event. Staff are scheduled against the event.</CardContent>
      </Card>
    );
  }

  const names = Object.fromEntries([...data.floorStaff.map((s) => [`s:${s.id}`, s.name]), ...data.teamMembers.map((m) => [`m:${m.id}`, m.name])]);
  const taken = new Set(data.assignments.map((a) => (a.staffMemberId ? `s:${a.staffMemberId}` : `m:${a.memberId}`)));

  async function add() {
    if (!person) return;
    setPending(true);
    setError(null);
    setWarning(null);
    const [kind, id] = [person.slice(0, 1), person.slice(2)];
    const result = await assignStaffAction(orderId, eventId as string, kind === "s" ? { staffMemberId: id } : { memberId: id }, duty, notes);
    setPending(false);
    if (!result.ok) return setError(result.error);
    if (result.conflicts.length > 0) setWarning(result.conflicts);
    setPerson("");
    setNotes("");
    router.refresh();
  }

  async function changeDuty(id: string, next: string, current: string | null) {
    const result = await updateAssignmentAction(orderId, id, next, current ?? "");
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  async function remove(id: string) {
    const result = await removeAssignmentAction(orderId, id);
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  return (
    <Card
      data-testid="staffing-card"
      onKeyDown={(e) => {
        // This card saves by itself; Enter in a field must not submit the whole order form around it.
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
    >
      <CardHeader>
        <CardTitle>Staff on this event ({data.assignments.length})</CardTitle>
        <p className="text-sm text-muted-foreground">Filled in by the kitchen team. Nothing is suggested from the guest count.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is scheduled yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                <div className="min-w-40 flex-1">
                  <p className="text-sm font-medium">
                    {a.name} {a.hasLogin && <Badge variant="outline">Has login</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">{[a.phone, a.notes].filter(Boolean).join(" · ") || " "}</p>
                </div>
                {canEdit ? (
                  <Select items={STAFF_DUTY_LABEL} value={a.duty} onValueChange={(v) => v && v !== a.duty && void changeDuty(a.id, v, a.notes)}>
                    <SelectTrigger aria-label={`Duty for ${a.name}`} className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAFF_DUTIES.map((d) => (
                        <SelectItem key={d} value={d}>
                          {STAFF_DUTY_LABEL[d]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="info">{STAFF_DUTY_LABEL[a.duty as keyof typeof STAFF_DUTY_LABEL]}</Badge>
                )}
                {canRemove && (
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${a.name}`} onClick={() => void remove(a.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canAdd && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-52 flex-1">
              <Select
                items={names}
                value={person}
                onValueChange={(v) => {
                  setPerson(v ?? "");
                  const staff = data.floorStaff.find((s) => `s:${s.id}` === v);
                  if (staff) setDuty(staff.defaultDuty);
                }}
              >
                <SelectTrigger aria-label="Person" className="w-full">
                  <SelectValue placeholder="Choose a person" />
                </SelectTrigger>
                <SelectContent>
                  {data.floorStaff.filter((s) => !taken.has(`s:${s.id}`)).length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Staff (no login)</SelectLabel>
                      {data.floorStaff
                        .filter((s) => !taken.has(`s:${s.id}`))
                        .map((s) => (
                          <SelectItem key={s.id} value={`s:${s.id}`}>
                            {s.name}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  )}
                  {data.teamMembers.filter((m) => !taken.has(`m:${m.id}`)).length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Team members</SelectLabel>
                      {data.teamMembers
                        .filter((m) => !taken.has(`m:${m.id}`))
                        .map((m) => (
                          <SelectItem key={m.id} value={`m:${m.id}`}>
                            {m.name}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
            <Select items={STAFF_DUTY_LABEL} value={duty} onValueChange={(v) => setDuty(v ?? duty)}>
              <SelectTrigger aria-label="Duty" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_DUTIES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {STAFF_DUTY_LABEL[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="w-48" aria-label="Note" placeholder="Note (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button type="button" disabled={!person || pending} onClick={() => void add()}>
              <Plus /> Add
            </Button>
          </div>
        )}
        {canAdd && data.floorStaff.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No floor staff yet. <Link href="/staff" className="underline">Add staff without a login</Link>.
          </p>
        )}

        {warning && (
          <p role="status" className="text-sm text-warning">
            Heads up: also booked on {warning.map((w) => w.label).join(", ")} around the same dates. Added anyway.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
