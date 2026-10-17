import type { roles } from "./permissions";

/**
 * The single source of truth for role display info (invite dropdown,
 * role-change dropdown, member/invitation labels, the role card on the
 * invite form). `permissions.ts` owns *grants*; this file owns *labels and
 * copy* — kept separate so permission logic and UI text don't live in the
 * same place. The bullet lists ("Permissions included" / "No access to")
 * are not written here: `role-permissions.ts` derives them from the real
 * grants, so the copy can never claim more or less than the role can do.
 * Every `id` here must match a key of `roles` in permissions.ts (enforced by
 * the `keyof typeof roles` type below).
 *
 * Adding a future role: a new entry in `roles` (permissions.ts) for the
 * grants, one here for the label/description, and one in
 * `team/_components/role-icons.ts` for its icon.
 */
type RoleDefinition = {
  id: keyof typeof roles;
  label: string;
  /** One line under the role name on the invite form's role card. */
  description: string;
  /** false = not offered in the invite/role-change dropdowns (owner is assigned at tenant creation, never invited). */
  invitable: boolean;
};

export const ROLE_DEFINITIONS = [
  {
    id: "owner",
    // The id stays `owner` (AJ, 2026-10-17); the UI calls the role Admin. It is the business's one top role, not the Platterly Ops admin.
    label: "Admin",
    description: "Full access to everything, including the team, roles and permissions, prices, settings and deleting business data.",
    invitable: false,
  },
  {
    id: "manager",
    label: "Manager",
    description: "Runs day-to-day operations: creates and edits most records and approves menus. Can delete Staff page records only, sees no prices unless the Admin allows it, and can't manage the team, roles or settings.",
    invitable: true,
  },
  {
    id: "staff",
    label: "Staff",
    description: "Views orders and quotations only, without prices. The Admin can allow more.",
    invitable: true,
  },
  {
    id: "kitchen",
    label: "Kitchen Team",
    description: "Works the Kitchen Dashboard: sees the kitchen's orders, moves the cooking status, downloads the kitchen order PDF and manages recipes. No prices.",
    invitable: true,
  },
  {
    id: "inventoryTeam",
    label: "Store / Inventory Team",
    description: "Owns stock, ingredients, suppliers and purchases, with the supplier costs that work needs. No customer prices.",
    invitable: true,
  },
  {
    id: "accounts",
    label: "Accounts Team (Finance)",
    description: "Owns invoices, payments, expenses and financial reports, with order prices and payment details. No deleting.",
    invitable: true,
  },
  {
    id: "salesEvents",
    label: "Sales & Event Team",
    description: "Handles customers, quotations, orders and events, and runs the menu approval workflow from sending a menu to the customer through kitchen approval. No prices unless the Admin allows it.",
    invitable: true,
  },
] as const satisfies readonly RoleDefinition[];

export const INVITABLE_ROLE_DEFINITIONS = ROLE_DEFINITIONS.filter((r) => r.invitable);

const LABEL_BY_ID = new Map(ROLE_DEFINITIONS.map((r) => [r.id as string, r.label]));

/** Falls back to the raw role string for safety (e.g. a role removed from the registry but still on old data). */
export function roleLabel(role: string): string {
  return LABEL_BY_ID.get(role) ?? role;
}
