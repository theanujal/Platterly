"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
const EXTRA_LABEL: Record<string, string> = { approve: "Approve", export: "Export", manage: "Manage" };

const sameGrants = (a: Grants, b: Grants) => MATRIX_MODULES.every((m) => [...(a[m.key] ?? [])].sort().join() === [...(b[m.key] ?? [])].sort().join());

/**
 * Manage Role Permissions tab. The owner picks a role and ticks View / Create / Edit / Delete (plus Approve, Export or Manage
 * where a module has them) per module, then saves. Ticking anything turns View on; clearing View clears the rest, since you
 * cannot change what you cannot see. The owner role is not listed: it always has full access.
 */
export function RolePermissionsForm({ roles }: { roles: EditableRole[] }) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(roles[0].id);
  const [edits, setEdits] = useState<Record<string, Grants>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const role = roles.find((r) => r.id === roleId) ?? roles[0];
  const grants = edits[role.id] ?? role.current;
  const dirty = !sameGrants(grants, role.current);
  const customised = !sameGrants(role.current, role.defaults);

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
    setMessage(null);
  }

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    setPending(true);
    setMessage(null);
    const result = await action();
    setPending(false);
    if (!result.ok) return setMessage({ ok: false, text: result.error });
    setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== role.id)));
    setMessage({ ok: true, text: success });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <KeyRound className="size-5" />
          Manage Role Permissions
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose what each role can view, create, edit and delete in your business.</p>
      </div>

      <div className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor="role-permissions-role">Role</Label>
        <Select
          items={Object.fromEntries(roles.map((r) => [r.id, r.label]))}
          value={role.id}
          onValueChange={(v) => {
            setRoleId(v ?? role.id);
            setMessage(null);
          }}
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
                  <th scope="row" className="px-4 py-2.5 text-left font-medium">{mod.label}</th>
                  {COLUMNS.map((c) => (
                    <td key={c.action} className="px-3 py-2.5 text-center">
                      {(mod.actions as readonly string[]).includes(c.action) ? (
                        <Checkbox
                          aria-label={`${role.label}: ${c.label} ${mod.label}`}
                          checked={granted.includes(c.action)}
                          disabled={pending}
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
                            disabled={pending}
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

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="md" disabled={!dirty || pending} onClick={() => run(() => saveRolePermissionsAction(role.id, grants), `${role.label} permissions saved.`)}>
          Save changes
        </Button>
        <Button
          type="button"
          size="md"
          variant="outline"
          disabled={(!customised && !dirty) || pending}
          onClick={() => run(() => resetRolePermissionsAction(role.id), `${role.label} is back to the default permissions.`)}
        >
          <RotateCcw className="size-4" /> Reset to defaults
        </Button>
        {customised && !dirty && <span className="text-xs text-muted-foreground">Changed from the defaults.</span>}
        {dirty && <span className="text-xs text-warning">Unsaved changes.</span>}
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}>
          {message.text}
        </p>
      )}

      <TeamNote>
        Changes apply to everyone with that role, the next time they open a page. Owners always have full access. Team management,
        settings and deleting business data stay with the Owner and cannot be handed to another role.
      </TeamNote>
    </div>
  );
}
