"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { MATRIX_MODULES, SENSITIVE_KEYS } from "@/lib/auth/role-matrix";
import {
  ACCESS_MODULES,
  ACTION_LABEL,
  COMING_SOON,
  MODULE_GROUPS,
  SENSITIVE_INFO,
  actionsOf,
  changedModules,
  hasAccess,
  isAllowed,
  setAccess,
  setSensitive,
  toggleAction,
  type Grants,
} from "@/lib/auth/role-editor";

/** What every panel gets: the role's name (for accessible labels), the grants being shown, the role's built-in grants, and a change callback. */
export interface PanelProps {
  roleLabel: string;
  grants: Grants;
  /** The role's built-in grants, so a row can say it was changed from them. */
  defaults: Grants;
  /** True while the editor is read-only (Edit not pressed) or a save is running. */
  disabled: boolean;
  onChange: (next: Grants) => void;
}

const moduleOf = (key: string) => ACCESS_MODULES.find((m) => m.key === key)!;

function Changed({ show }: { show: boolean }) {
  return show ? <Badge variant="info">Changed</Badge> : null;
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>;
}

/** Tab 1: one switch per module. Off also clears whatever the role could do in it (the same rule as before the redesign). */
export function ModuleAccessPanel({ roleLabel, grants, defaults, disabled, onChange }: PanelProps) {
  const changed = new Set<string>(changedModules(grants, defaults));
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">Choose which parts of Platterly this role can open. Turning a module off also removes everything the role could do in it.</p>
      {MODULE_GROUPS.map((group) => (
        <section key={group.id} aria-label={group.label} className="flex flex-col gap-2">
          <GroupHeading>{group.label}</GroupHeading>
          <div className="grid gap-2 md:grid-cols-2">
            {group.keys.map((key) => {
              const mod = moduleOf(key);
              return (
                <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {mod.label}
                      <Changed show={changed.has(key)} />
                    </p>
                    <p className="text-xs text-muted-foreground">{mod.pages}</p>
                  </div>
                  <Switch aria-label={`${roleLabel}: View ${mod.label}`} checked={hasAccess(grants, key)} disabled={disabled} onCheckedChange={(on) => onChange(setAccess(grants, key, on === true))} />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Tab 2: the actions inside each module (View is the module switch on tab 1). Disabled, with the reason, while the module is off. */
export function ActionsPanel({ roleLabel, grants, defaults, disabled, onChange }: PanelProps) {
  const changed = new Set<string>(changedModules(grants, defaults));
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">Choose what this role can do inside each module it can open. Ticking an action opens the module too.</p>
      {MODULE_GROUPS.map((group) => (
        <section key={group.id} aria-label={group.label} className="flex flex-col gap-2">
          <GroupHeading>{group.label}</GroupHeading>
          <div className="flex flex-col gap-2">
            {group.keys.map((key) => {
              const mod = moduleOf(key);
              const actions = actionsOf(key);
              const open = hasAccess(grants, key);
              return (
                <div key={key} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
                    {mod.label}
                    <Changed show={changed.has(key)} />
                    {!open && <span className="text-xs font-normal text-muted-foreground">Turn on {mod.label} in Module Access to set its actions.</span>}
                  </p>
                  {actions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">View only: nothing else to set.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {actions.map((action) => (
                        <label
                          key={action}
                          className={`flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm ${open ? "" : "text-muted-foreground"}`}
                        >
                          <Checkbox
                            aria-label={`${roleLabel}: ${ACTION_LABEL[action] ?? action} ${mod.label}`}
                            checked={isAllowed(grants, key, action)}
                            disabled={disabled || !open}
                            onCheckedChange={(on) => onChange(toggleAction(grants, key, action, on === true))}
                          />
                          {ACTION_LABEL[action] ?? action}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section aria-label="Coming soon" className="flex flex-col gap-2">
        <GroupHeading>Coming soon</GroupHeading>
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          {COMING_SOON.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <p>
                <span className="font-medium">{item.label}</span> <span className="text-xs">{item.note}</span>
              </p>
              <Badge variant="neutral">Coming soon</Badge>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Tab 3: the eight sensitive-data keys, each its own switch, independent of module access. */
export function SensitivePanel({ roleLabel, grants, defaults, disabled, onChange }: PanelProps) {
  const sensitive = MATRIX_MODULES.find((m) => m.key === "sensitive");
  const defaultKeys = new Set(defaults.sensitive ?? []);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Prices, costs, payments and financial reports are controlled here, separately from module access: a role can open a module without seeing its prices. Each
        switch is enforced on the server, so a hidden figure is never sent to the browser, a PDF or an export.
      </p>
      <div className="flex flex-col gap-2">
        {SENSITIVE_KEYS.filter((key) => sensitive?.actions.includes(key)).map((key) => {
          const info = SENSITIVE_INFO[key];
          return (
            <div key={key} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {info.label}
                  <Changed show={isAllowed(grants, "sensitive", key) !== defaultKeys.has(key)} />
                </p>
                <p className="text-xs text-muted-foreground">{info.covers}</p>
              </div>
              <Switch aria-label={`${roleLabel}: ${info.label}`} checked={isAllowed(grants, "sensitive", key)} disabled={disabled} onCheckedChange={(on) => onChange(setSensitive(grants, key, on === true))} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
