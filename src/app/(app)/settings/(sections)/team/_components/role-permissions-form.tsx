"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LayoutGrid, Lock, Pencil, RotateCcw } from "lucide-react";
import { cn } from "cn";
import { toast } from "@/components/ui/toaster";
import { useUnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { sameGrants, summarize, type Grants } from "@/lib/auth/role-editor";
import { resetRolePermissionsAction, saveRolePermissionsAction } from "../actions";
import { ActionsPanel, ModuleAccessPanel, SensitivePanel } from "./role-permission-panels";
import { TeamNote } from "./team-note";

export interface EditableRole {
  id: string;
  label: string;
  /** One line about the role, from the role registry. */
  description: string;
  /** What this role can do in this business right now (the built-in grants with any saved change applied). */
  current: Grants;
  /** The built-in grants, used by Reset and to show when a role has been changed. */
  defaults: Grants;
}

const TABS = [
  { id: "modules", label: "Module Access", icon: LayoutGrid },
  { id: "actions", label: "Actions & Operations", icon: Pencil },
  { id: "sensitive", label: "Sensitive Data Access", icon: Lock },
] as const;
type TabId = (typeof TABS)[number]["id"];

/**
 * Manage Role Permissions tab (Roles & Permissions Phase B). A list of the editable roles and, for the chosen role, an editor with
 * three tabs: Module Access (which modules the role can open), Actions & Operations (what it can do inside them) and Sensitive Data
 * Access (the independent price, cost and payment keys). It reads and saves exactly what the old matrix did: the same grants, the same
 * server actions, the same rules (ticking an action turns the module on; turning a module off clears its actions), so nothing about
 * enforcement changes. Like the other Settings pages it opens read-only; Edit unlocks it, Save changes asks to confirm, Cancel drops the
 * edits, and leaving with unsaved edits asks first. The Admin (owner) is not listed: it always has full access.
 */
export function RolePermissionsForm({ roles }: { roles: EditableRole[] }) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(roles[0].id);
  const [tab, setTab] = useState<TabId>("modules");
  const [draft, setDraft] = useState<Grants | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const role = roles.find((r) => r.id === roleId) ?? roles[0];
  const editing = draft !== null;
  const grants = draft ?? role.current;
  const dirty = editing && !sameGrants(grants, role.current);
  const customised = !sameGrants(role.current, role.defaults);
  const summary = summarize(grants);
  const guard = useUnsavedChangesGuard(dirty, "role's permissions");

  function onTabKey(event: React.KeyboardEvent, index: number) {
    const next = { ArrowRight: (index + 1) % TABS.length, ArrowLeft: (index + TABS.length - 1) % TABS.length, Home: 0, End: TABS.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  }

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string): Promise<boolean> {
    setPending(true);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    setDraft(null);
    toast.success(success);
    router.refresh();
    return true;
  }

  const panel = { roleLabel: role.label, grants, defaults: role.defaults, disabled: pending || !editing, onChange: setDraft };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <KeyRound className="size-5" />
            Manage Role Permissions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {editing ? `Editing ${role.label}. Nothing changes until you save.` : "Choose what each role can open, do and see in your business. Nothing saves by itself: pick a role, press Edit, make your changes, then Save."}
          </p>
        </div>
        {!editing && (
          <Button type="button" variant="outline" size="md" className="shrink-0" onClick={() => setDraft(role.current)}>
            <Pencil data-icon="inline-start" />
            Edit
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <nav aria-label="Roles" className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {roles.map((r) => {
            const selected = r.id === role.id;
            const changed = !sameGrants(r.current, r.defaults);
            return (
              <button
                key={r.id}
                type="button"
                aria-current={selected ? "true" : undefined}
                disabled={editing && !selected}
                title={editing && !selected ? "Save or cancel your changes to switch role." : undefined}
                onClick={() => setRoleId(r.id)}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border bg-card p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                  selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:bg-muted",
                )}
              >
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {r.label}
                  {changed && <Badge variant="info">Customised</Badge>}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{r.description}</span>
              </button>
            );
          })}
        </nav>

        <section aria-label={`${role.label} permissions`} className="flex min-w-0 flex-col gap-4 rounded-lg border border-border p-3 sm:p-5">
          <div>
            <h3 className="text-lg font-semibold">{role.label}</h3>
            <p className="text-sm text-muted-foreground">{role.description}</p>
            <p data-testid="role-summary" className="mt-2 text-xs text-muted-foreground">
              Opens {summary.modulesOn} of {summary.modulesTotal} modules · {summary.actionsOn} actions allowed · {summary.sensitiveOn} of {summary.sensitiveTotal} sensitive items
            </p>
          </div>

          <div role="tablist" aria-label="Permission type" className="flex gap-1 overflow-x-auto border-b border-border">
            {TABS.map(({ id, label, icon: Icon }, index) => (
              <button
                key={id}
                ref={(el) => {
                  tabRefs.current[id] = el;
                }}
                id={`role-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-label={label}
                title={label}
                aria-controls={`role-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={(e) => onTabKey(e, index)}
                className={cn(
                  "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:gap-2 sm:px-4",
                  tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {/* On a phone only the active tab shows its name, so the three fit without sideways scrolling (as the Team tabs do). */}
                <span className={tab === id ? undefined : "hidden sm:inline"}>{label}</span>
              </button>
            ))}
          </div>

          <div id={`role-panel-${tab}`} role="tabpanel" aria-labelledby={`role-tab-${tab}`} tabIndex={0} className="outline-none">
            {tab === "modules" && <ModuleAccessPanel {...panel} />}
            {tab === "actions" && <ActionsPanel {...panel} />}
            {tab === "sensitive" && <SensitivePanel {...panel} />}
          </div>

          {editing ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button type="button" size="md" disabled={!dirty || pending} onClick={() => setConfirmSave(true)}>
                Save changes
              </Button>
              <Button type="button" size="md" variant="outline" disabled={pending} onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button type="button" size="md" variant="outline" disabled={(!customised && !dirty) || pending} onClick={() => setConfirmReset(true)}>
                <RotateCcw className="size-4" /> Reset to defaults
              </Button>
              {dirty && <span className="text-xs text-warning">Unsaved changes.</span>}
            </div>
          ) : (
            customised && <p className="border-t border-border pt-4 text-xs text-muted-foreground">This role has been changed from the defaults.</p>
          )}
        </section>
      </div>
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
