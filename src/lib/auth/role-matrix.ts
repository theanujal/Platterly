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
  { key: "customers", label: "Customers", actions: ["view", "create", "edit", "delete"] },
  { key: "quotations", label: "Quotations", actions: ["view", "create", "edit", "delete"] },
  { key: "orders", label: "Orders & Events", actions: ["view", "create", "edit", "delete"] },
  { key: "eventTypes", label: "Event Types", actions: ["view", "create", "edit", "delete"] },
  { key: "menus", label: "Menu Catalog & Approvals", actions: ["view", "create", "edit", "delete", "approve"] },
  { key: "inventory", label: "Inventory & Purchasing", actions: ["view", "create", "edit", "delete"] },
  { key: "invoices", label: "Invoices", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "payments", label: "Payments", actions: ["view", "create", "manage"] },
  { key: "expenses", label: "Expenses", actions: ["view", "create", "edit", "delete"] },
  { key: "reports", label: "Reports", actions: ["view", "export"] },
  { key: "audit", label: "Audit Log", actions: ["view"] },
  { key: "staffing", label: "Staff & Logistics", actions: ["view", "create", "edit", "delete"] },
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
