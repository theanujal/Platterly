import type { roles } from "./permissions";

/**
 * The single source of truth for role display info (invite dropdown,
 * role-change dropdown, member/invitation table labels). `permissions.ts`
 * owns *grants*; this file owns *labels and copy* — kept separate so
 * permission logic and UI text don't live in the same place. Every `id`
 * here must match a key of `roles` in permissions.ts (enforced by the
 * `keyof typeof roles` type below).
 *
 * Adding a future role is a two-file touch: a new entry in `roles`
 * (permissions.ts) for the grants, and a new entry here for the label/
 * invite-dropdown preview. Nothing else needs to change.
 */
type RoleDefinition = {
  id: keyof typeof roles;
  label: string;
  /** false = not offered in the invite/role-change dropdowns (owner is assigned at tenant creation, never invited). */
  invitable: boolean;
  /** Bullet points shown under "Show what this role can do" in the invite dialog. Omitted for non-invitable roles. */
  previews?: string[];
};

export const ROLE_DEFINITIONS = [
  { id: "owner", label: "Owner", invitable: false },
  {
    id: "manager",
    label: "Manager",
    invitable: true,
    previews: [
      "Can view and create/edit customers, events, orders, menus, inventory",
      "Can view invoices and payments, create new ones",
      "Cannot delete records, cannot manage the team, cannot edit settings",
    ],
  },
  {
    id: "staff",
    label: "Staff",
    invitable: true,
    previews: [
      "View-only across customers, events, orders, menus, inventory, reports",
      "No access to invoices, payments, team management, or settings",
    ],
  },
  {
    id: "sales",
    label: "Sales Team",
    invitable: true,
    previews: [
      "Can view and create/edit customers, quotations, and orders",
      "Read-only on events and the menu catalog",
      "No access to inventory, invoices, payments, team management, or settings",
    ],
  },
  {
    id: "kitchen",
    label: "Kitchen Team",
    invitable: true,
    previews: [
      "Can view and update kitchen production status on the Kitchen Dashboard",
      "Read-only on events and orders",
      "Cannot approve menus (that's Event Team) or access customers, inventory, invoices, or payments",
    ],
  },
  {
    id: "inventoryTeam",
    label: "Store / Inventory Team",
    invitable: true,
    previews: [
      "Full access to inventory — view, create, edit, and delete stock records",
      "Can view reports",
      "No access to customers, events, orders, menus, invoices, or payments",
    ],
  },
  {
    id: "accounts",
    label: "Accounts Team (Finance)",
    invitable: true,
    previews: [
      "Can view, create, edit, and export invoices",
      "Can view, create, and manage payments",
      "Can view and export reports",
      "No access to customers, events, orders, menus, or inventory",
    ],
  },
  {
    id: "eventTeam",
    label: "Event Team",
    invitable: true,
    previews: [
      "Can view and create/edit events; read-only on orders",
      "Owns the menu approval workflow — sending menus to customers and driving approval through to Kitchen Approved/Final",
      "No access to customers, quotations, inventory, invoices, or payments",
    ],
  },
] as const satisfies readonly RoleDefinition[];

export const INVITABLE_ROLE_DEFINITIONS = ROLE_DEFINITIONS.filter((r) => r.invitable);

const LABEL_BY_ID = new Map(ROLE_DEFINITIONS.map((r) => [r.id as string, r.label]));

/** Falls back to the raw role string for safety (e.g. a role removed from the registry but still on old data). */
export function roleLabel(role: string): string {
  return LABEL_BY_ID.get(role) ?? role;
}
