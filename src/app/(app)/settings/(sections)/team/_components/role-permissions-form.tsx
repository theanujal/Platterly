"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Pencil, RotateCcw } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { useUnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MATRIX_MODULES } from "@/lib/auth/role-matrix";
import { resetRolePermissionsAction, saveRolePermissionsAction } from "../actions";
import { TeamNote } from "./team-note";

type Grants = Record<string, string[]>;
export interface EditableRole {
  id: string;
  label: string;
  /** What this role can do in this business right now. */
  current: Grants;
  /** The built-in grants, used by Reset and to show when a role has been changed. */
  defaults: Grants;
}

const COLUMNS = [
  { action: "view", label: "View" },
  { action: "create", label: "Create" },
  { action: "edit", label: "Edit" },
  { action: "delete", label: "Delete" },
] as const;
const COLUMN_ACTIONS: readonly string[] = COLUMNS.map((c) => c.action);
const EXTRA_LABEL: Record<string, string> = {
  approve: "Approve",
  export: "Export",
  manage: "Manage",
  updateStatus: "Update cooking status",
  viewPdf: "Kitchen PDF",
  menuPrices: "Menu & dish prices",
  orderPrices: "Order & quotation prices",
  paymentDetails: "Payment details",
  supplierCosts: "Supplier costs",
  recipeCosts: "Recipe costs",
  profitability: "Profitability",
  financialReports: "Financial reports",
  commercialDocuments: "Commercial PDFs",
};

const sameGrants = (a: Grants, b: Grants) => MATRIX_MODULES.every((m) => [...(a[m.key] ?? [])].sort().join() === [...(b[m.key] ?? [])].sort().join());

/**
 * Manage Role Permissions tab. Like the other Settings pages it opens read-only; Edit unlocks the ticks, Save changes asks
 * to confirm, Cancel drops the edits. The owner picks a role and ticks View / Create / Edit / Delete (plus Approve, Export or Manage
 * where a module has them) per module, then saves. Ticking anything turns View on; clearing View clears the rest, since you
 * cannot change what you cannot see. The owner role is not listed: it always has full access.
 */
export function RolePermissionsForm({ roles }: { roles: EditableRole[] }) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(roles[0].id);
  const [edits, setEdits] = useState<Record<string, Grants>>({});
  const [pending, setPending] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [editing, setEditing] = useState(false);

  const role = roles.find((r) => r.id === roleId) ?? roles[0];
  const grants = edits[role.id] ?? role.current;
  const dirty = !sameGrants(grants, role.current);
  const customised = !sameGrants(role.current, role.defaults);
  const guard = useUnsavedChangesGuard(editing && dirty, "role's permissions");

  function stopEditing() {
    setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== role.id)));
    setEditing(false);
  }

  function toggle(moduleKey: string, action: string, checked: boolean) {
    const mod = MATRIX_MODULES.find((m) => m.key === moduleKey);
    if (!mod) return;
    const set = new Set(grants[moduleKey] ?? []);
    if (checked) {
      set.add(action);
      set.add("view");
    } else if (action === "view") {
      set.clear();
    } else {
      set.delete(action);
    }
    setEdits({ ...edits, [role.id]: { ...grants, [moduleKey]: mod.actions.filter((a) => set.has(a)) } });
  }

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string): Promise<boolean> {
    setPending(true);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    stopEditing();
    toast.success(success);
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <KeyRound className="size-5" />
            Manage Role Permissions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {editing ? `Editing ${role.label}. Nothing changes until you save.` : "Choose what each role can view, create, edit and delete in your business. Nothing saves by itself: press Edit, make your changes, then Save."}
          </p>
        </div>
        {!editing && (
          <Button type="button" variant="outline" size="md" className="shrink-0" onClick={() => setEditing(true)}>
            <Pencil data-icon="inline-start" />
            Edit
          </Button>
        )}
      </div>

      <div className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor="role-permissions-role">Role</Label>
        <Select
          items={Object.fromEntries(roles.map((r) => [r.id, r.label]))}
          value={role.id}
          disabled={editing}
          onValueChange={(v) => setRoleId(v ?? role.id)}
        >
          <SelectTrigger id="role-permissions-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Module</th>
              {COLUMNS.map((c) => (
                <th key={c.action} scope="col" className="px-3 py-2.5 text-center font-medium">{c.label}</th>
              ))}
              <th scope="col" className="px-3 py-2.5 font-medium">Special</th>
            </tr>
          </thead>
          <tbody>
            {MATRIX_MODULES.map((mod) => {
              const granted = grants[mod.key] ?? [];
              const extras = mod.actions.filter((a) => !COLUMN_ACTIONS.includes(a));
              return (
                <tr key={mod.key} className="border-t border-border">
                  <th scope="row" className="px-4 py-2.5 text-left font-medium">
                    {mod.label}
                    <span className="block text-xs font-normal text-muted-foreground">{mod.pages}</span>
                  </th>
                  {COLUMNS.map((c) => (
                    <td key={c.action} className="px-3 py-2.5 text-center">
                      {(mod.actions as readonly string[]).includes(c.action) ? (
                        <Checkbox
                          aria-label={`${role.label}: ${c.label} ${mod.label}`}
                          checked={granted.includes(c.action)}
                          disabled={pending || !editing}
                          onCheckedChange={(checked) => toggle(mod.key, c.action, checked === true)}
                        />
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {extras.length === 0 && <span className="text-muted-foreground">–</span>}
                      {extras.map((a) => (
                        <label key={a} className="flex items-center gap-1.5">
                          <Checkbox
                            aria-label={`${role.label}: ${EXTRA_LABEL[a] ?? a} ${mod.label}`}
                            checked={granted.includes(a)}
                            disabled={pending || !editing}
                            onCheckedChange={(checked) => toggle(mod.key, a, checked === true)}
                          />
                          {EXTRA_LABEL[a] ?? a}
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="md" disabled={!dirty || pending} onClick={() => setConfirmSave(true)}>
            Save changes
          </Button>
          <Button type="button" size="md" variant="outline" disabled={pending} onClick={stopEditing}>
            Cancel
          </Button>
          <Button type="button" size="md" variant="outline" disabled={(!customised && !dirty) || pending} onClick={() => setConfirmReset(true)}>
            <RotateCcw className="size-4" /> Reset to defaults
          </Button>
          {dirty && <span className="text-xs text-warning">Unsaved changes.</span>}
        </div>
      ) : (
        customised && <p className="text-xs text-muted-foreground">This role has been changed from the defaults.</p>
      )}
      {guard.dialog}

      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title={`Save ${role.label} permissions?`}
        description="Everyone with this role gets this access the next time they open a page."
        confirmLabel="Save changes"
        destructive={false}
        pending={pending}
        onConfirm={async () => {
          await run(() => saveRolePermissionsAction(role.id, grants), `${role.label} permissions saved.`);
          setConfirmSave(false);
        }}
      />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={`Reset ${role.label} to the defaults?`}
        description="Every change you made to this role's permissions is removed, and everyone with the role gets the default access."
        confirmLabel="Reset to defaults"
        pending={pending}
        onConfirm={async () => {
          await run(() => resetRolePermissionsAction(role.id), `${role.label} is back to the default permissions.`);
          setConfirmReset(false);
        }}
      />

      <TeamNote>
        Changes apply to everyone with that role, the next time they open a page. The Admin always has full access. Team management,
        settings and deleting business data stay with the Admin and cannot be handed to another role.
      </TeamNote>
    </div>
  );
}
