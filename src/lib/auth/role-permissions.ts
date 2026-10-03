import { roles } from "./permissions";

/**
 * Plain-language summary of what a role can do, derived from the real grants
 * in `permissions.ts` (never hand-written), so the invite form's role card
 * can't drift from what the role is actually allowed. Server-side helper:
 * pages call it and pass the strings down, so the access-control engine
 * stays out of client bundles.
 */

const AREAS = [
  ["customers", "customers"],
  ["quotations", "quotations"],
  ["orders", "orders"],
  ["eventTypes", "event types"],
  ["menus", "menus"],
  ["inventory", "inventory"],
  ["invoices", "invoices"],
  ["payments", "payments"],
  ["reports", "reports"],
  ["audit", "audit log"],
  ["users", "team members"],
  ["settings", "settings"],
] as const;

const ACTION_ORDER = ["view", "create", "edit", "delete", "approve", "export", "manage"] as const;

function joinActions(actions: string[]): string {
  const [first, ...rest] = actions;
  if (rest.length === 0) return first;
  return `${[first, ...rest.slice(0, -1)].join(", ")} and ${rest[rest.length - 1]}`;
}

export interface RolePermissionSummary {
  /** e.g. "View, create and edit customers" */
  included: string[];
  /** Areas the role has no access to at all, e.g. ["Inventory", "Invoices"] */
  excluded: string[];
}

export function describeRolePermissions(roleId: keyof typeof roles): RolePermissionSummary {
  const grants = roles[roleId].statements as Record<string, readonly string[] | undefined>;
  const included: string[] = [];
  const excluded: string[] = [];

  for (const [key, noun] of AREAS) {
    const granted = grants[key] ?? [];
    const actions = ACTION_ORDER.filter((action) => granted.includes(action));
    if (actions.length === 0) {
      excluded.push(noun.charAt(0).toUpperCase() + noun.slice(1));
      continue;
    }
    const phrase = `${joinActions([...actions])} ${noun}`;
    included.push(phrase.charAt(0).toUpperCase() + phrase.slice(1));
  }

  return { included, excluded };
}
