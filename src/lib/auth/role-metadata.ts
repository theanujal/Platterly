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
    label: "Owner",
    description: "Full access to everything, including the team, settings and deleting business data.",
    invitable: false,
  },
  {
    id: "manager",
    label: "Manager",
    description: "Runs day-to-day operations: creates and edits most records, but can't delete, manage the team or change settings.",
    invitable: true,
  },
  {
    id: "staff",
    label: "Staff",
    description: "Read-only access to view orders, inventory and basic information.",
    invitable: true,
  },
  {
    id: "kitchen",
    label: "Kitchen Team",
    description: "Works the Kitchen Dashboard and updates production status on approved menus.",
    invitable: true,
  },
  {
    id: "inventoryTeam",
    label: "Store / Inventory Team",
    description: "Owns stock, ingredients and purchases.",
    invitable: true,
  },
  {
    id: "accounts",
    label: "Accounts Team (Finance)",
    description: "Owns invoices, payments and financial reports.",
    invitable: true,
  },
  {
    id: "salesEvents",
    label: "Sales & Event Team",
    description: "Handles enquiries, customers, quotations, orders and events, and runs the menu approval workflow from sending a menu to the customer through kitchen approval.",
    invitable: true,
  },
] as const satisfies readonly RoleDefinition[];

export const INVITABLE_ROLE_DEFINITIONS = ROLE_DEFINITIONS.filter((r) => r.invitable);

const LABEL_BY_ID = new Map(ROLE_DEFINITIONS.map((r) => [r.id as string, r.label]));

/** Falls back to the raw role string for safety (e.g. a role removed from the registry but still on old data). */
export function roleLabel(role: string): string {
  return LABEL_BY_ID.get(role) ?? role;
}
