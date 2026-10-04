"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, User } from "lucide-react";
import { AddDrawer, DrawerForm, FormDrawer } from "@/components/catalog/form-drawer";
import { CatalogCardMenu } from "@/components/catalog/catalog-card-menu";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAFF_DUTIES, STAFF_DUTY_LABEL } from "@/modules/employees/duty";
import { createStaffMemberAction, deleteStaffMemberAction, updateStaffMemberAction, type ActionResult, type StaffMemberPayload } from "../actions";

const EMPTY: StaffMemberPayload = { name: "", phone: "", defaultDuty: "SERVING", notes: "", isActive: true };

function StaffMemberForm({ initialValues, submitLabel, onSubmit, onSuccess, onCancel }: { initialValues: StaffMemberPayload; submitLabel: string; onSubmit: (p: StaffMemberPayload) => Promise<ActionResult>; onSuccess: () => void; onCancel: () => void }) {
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = <K extends keyof StaffMemberPayload>(key: K, value: StaffMemberPayload[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await onSubmit(values);
    setPending(false);
    if (!result.ok) return setError(result.error);
    onSuccess();
  }

  return (
    <DrawerForm
      onSubmit={submit}
      error={error}
      pending={pending}
      submitLabel={submitLabel}
      onCancel={onCancel}
      active={{ id: "staff-active", checked: values.isActive, onChange: (c) => set("isActive", c), onLabel: "Active (can be scheduled)", offLabel: "Inactive (not offered for scheduling)" }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="staff-name">Name</Label>
        <IconInput icon={User} id="staff-name" required value={values.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="staff-phone">Phone</Label>
        <IconInput icon={Phone} id="staff-phone" type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="staff-duty">Usual duty</Label>
        <Select items={STAFF_DUTY_LABEL} value={values.defaultDuty} onValueChange={(v) => set("defaultDuty", v ?? values.defaultDuty)}>
          <SelectTrigger id="staff-duty" className="w-full">
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
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="staff-notes">Notes</Label>
        <Textarea id="staff-notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
    </DrawerForm>
  );
}

export function AddStaffMemberDialog() {
  const router = useRouter();
  return (
    <AddDrawer buttonLabel="Add Staff Member" tileLabel="Add Staff Member" tileDescription="Someone with no login" title="New Staff Member" description="A person who works events but does not sign in to Platterly.">
      {(close) => (
        <StaffMemberForm
          initialValues={EMPTY}
          submitLabel="Add staff member"
          onSubmit={createStaffMemberAction}
          onCancel={close}
          onSuccess={() => {
            close();
            router.refresh();
          }}
        />
      )}
    </AddDrawer>
  );
}

export function StaffMemberRowActions({ id, name, initialValues, canEdit, canDelete }: { id: string; name: string; initialValues: StaffMemberPayload; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  if (!canEdit && !canDelete) return null;
  return (
    <>
      <CatalogCardMenu
        name={name}
        entityLabel="Staff Member"
        variant="plain"
        onEdit={() => (canEdit ? setEditOpen(true) : undefined)}
        onDelete={() => (canDelete ? deleteStaffMemberAction(id) : Promise.resolve({ ok: false as const, error: "You cannot delete staff." }))}
        deleteDescription="Only possible while they have not been scheduled on an event. Otherwise mark them inactive."
      />
      <FormDrawer open={editOpen} onOpenChange={setEditOpen} title="Edit Staff Member">
        <StaffMemberForm
          key={JSON.stringify(initialValues)}
          initialValues={initialValues}
          submitLabel="Save changes"
          onSubmit={(p) => updateStaffMemberAction(id, p)}
          onCancel={() => setEditOpen(false)}
          onSuccess={() => {
            setEditOpen(false);
            router.refresh();
          }}
        />
      </FormDrawer>
    </>
  );
}
