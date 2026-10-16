/**
 * The modules and actions an owner may switch on or off per role in Team Management -> Manage Role Permissions.
 * Plain data (no access-control imports) so the client form can use it. The server only ever accepts what is listed here
 * (`sanitizeGrants`), and a test checks every entry exists in `statement` (permissions.ts).
 *
 * Left out on purpose: `tenant` (the Danger Zone data purge), `users` (team management) and `settings` stay with the owner and
 * manager as built in, and `orders:bypass_date_restriction` stays owner-only. Letting another role manage the team or
 * settings would let it raise its own access, and Better Auth's invite endpoints are owner-only regardless.
 */
export const MATRIX_MODULES = [
  { key: "orders", label: "Orders", pages: "Orders, Calendar", actions: ["view", "create", "edit", "delete"] },
  { key: "quotations", label: "Quotations", pages: "Quotations", actions: ["view", "create", "edit", "delete"] },
  { key: "invoices", label: "Invoices", pages: "Invoices", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "customers", label: "Customers", pages: "Customers, Abandoned Orders", actions: ["view", "create", "edit", "delete"] },
  { key: "menus", label: "Menu Catalog & Approvals", pages: "Menu Catalog, Menu Approvals, Kitchen Dashboard", actions: ["view", "create", "edit", "delete", "approve"] },
  { key: "eventTypes", label: "Event Types", pages: "Event Types in Menu Catalog", actions: ["view", "create", "edit", "delete"] },
  { key: "payments", label: "Payments", pages: "Overdue Payments, recording payments", actions: ["view", "create", "manage"] },
  { key: "expenses", label: "Finance", pages: "Expenses, Profitability", actions: ["view", "create", "edit", "delete"] },
  { key: "reports", label: "Reports", pages: "Reports & Activity", actions: ["view", "export"] },
  { key: "audit", label: "Audit Log", pages: "Audit Log", actions: ["view"] },
  { key: "inventory", label: "Stock & Supplies", pages: "Inventory, Suppliers, Purchasing, Recipes", actions: ["view", "create", "edit", "delete"] },
  { key: "staffing", label: "Staff", pages: "Staff, event staffing, logistics", actions: ["view", "create", "edit", "delete"] },
] as const;

export type MatrixModuleKey = (typeof MATRIX_MODULES)[number]["key"];
export type RoleGrants = Partial<Record<MatrixModuleKey, string[]>>;

/** Roles an owner can edit: every built-in role except owner. */
export const EDITABLE_ROLE_IDS = ["manager", "staff", "kitchen", "inventoryTeam", "accounts", "salesEvents"] as const;
export type EditableRoleId = (typeof EDITABLE_ROLE_IDS)[number];

export function isEditableRole(role: string): role is EditableRoleId {
  return (EDITABLE_ROLE_IDS as readonly string[]).includes(role);
}

/**
 * Keeps only known modules and actions, drops duplicates, and makes sure any module with an action also has "view"
 * (you cannot create or edit what you cannot see). Every module is present in the result, empty when nothing is allowed.
 */
export function sanitizeGrants(input: unknown): Record<MatrixModuleKey, string[]> {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out = {} as Record<MatrixModuleKey, string[]>;
  for (const mod of MATRIX_MODULES) {
    const raw = Array.isArray(source[mod.key]) ? (source[mod.key] as unknown[]) : [];
    const picked = mod.actions.filter((action) => raw.includes(action));
    out[mod.key] = picked.length > 0 && !picked.includes("view") ? ["view", ...picked] : [...picked];
  }
  return out;
}
