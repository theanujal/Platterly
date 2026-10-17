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
  ["staffing", "staff scheduling"],
  ["users", "team members"],
  ["settings", "settings"],
  ["kitchen", "the kitchen dashboard"],
  ["recipes", "recipes"],
] as const;

/** What each sensitive key lets a person see, in the words the invite card uses. */
const SENSITIVE_LABEL: Record<string, string> = {
  menuPrices: "menu and dish prices",
  orderPrices: "order and quotation prices",
  paymentDetails: "payment details",
  supplierCosts: "supplier costs",
  recipeCosts: "recipe costs",
  profitability: "profitability",
  financialReports: "financial reports",
  commercialDocuments: "customer-facing documents",
};

const ACTION_ORDER = ["view", "create", "edit", "delete", "approve", "export", "manage", "updateStatus", "viewPdf"] as const;

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
  /** What prices and figures the role sees, separate from the modules: "No prices or costs" or "See order prices and payment details". */
  data: string;
}

export function describeRolePermissions(roleId: keyof typeof roles, override?: Record<string, readonly string[]>): RolePermissionSummary {
  // `override` = this business's saved changes (Manage Role Permissions); they replace the built-in grants for the modules they list.
  const grants = { ...(roles[roleId].statements as Record<string, readonly string[] | undefined>), ...override };
  const included: string[] = [];
  const excluded: string[] = [];

  for (const [key, noun] of AREAS) {
    const granted = grants[key] ?? [];
    if (key === "kitchen") {
      // The kitchen's three actions read better as what the person does than as "view, updateStatus and viewPdf".
      if (granted.length === 0) excluded.push("Kitchen dashboard");
      else included.push(["Work the kitchen dashboard", granted.includes("updateStatus") ? "update cooking status" : null, granted.includes("viewPdf") ? "download the kitchen order PDF" : null].filter(Boolean).join(", "));
      continue;
    }
    const actions = ACTION_ORDER.filter((action) => granted.includes(action));
    if (actions.length === 0) {
      excluded.push(noun.charAt(0).toUpperCase() + noun.slice(1));
      continue;
    }
    const phrase = `${joinActions([...actions])} ${noun}`;
    included.push(phrase.charAt(0).toUpperCase() + phrase.slice(1));
  }

  const seen = (grants.sensitive ?? []).map((key) => SENSITIVE_LABEL[key]).filter(Boolean);
  const data = seen.length > 0 ? `See ${joinActions(seen)}` : "No prices or costs";

  return { included, excluded, data };
}
