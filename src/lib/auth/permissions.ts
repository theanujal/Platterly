import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  ownerAc,
  memberAc,
} from "better-auth/plugins/organization/access";

/**
 * Better Auth's own `invitation`/`member`/`team`/`ac` grants (not our own
 * `statement` below) are what let a role call its organization-management
 * endpoints (createInvitation, updateMemberRole, etc.) — `memberAc` grants
 * `invitation: []` (explicit deny), which is why manager/staff can't invite
 * today. `ownerAc.statements` bundles these together with `organization:
 * ["update", "delete"]` — but that `"delete"` gates a REAL
 * `auth.api.deleteOrganization` endpoint (crud-org.mjs) that hard-deletes the
 * Organization row outright, nothing survives. The new `admin` role below
 * deliberately does NOT spread `...ownerAc.statements` wholesale — it picks
 * only the team-management pieces, explicitly excluding `organization:
 * ["delete"]`, so "Team Admin" can never delete the tenant via that
 * Better-Auth-native path, matching Chunk 5's "owner-only forever" decision
 * for both our own Danger Zone purge (`tenant: ["delete"]` below) and this.
 */
const adminOrganizationManagementGrants = {
  organization: ["update"],
  member: ownerAc.statements.member,
  invitation: ownerAc.statements.invitation,
  team: ownerAc.statements.team,
  ac: ownerAc.statements.ac,
} as const;

/**
 * Business-module permissions (PRD §15: module/action-level RBAC).
 * `defaultStatements` covers organization-management actions (invite members,
 * manage teams, etc.) that Better Auth's organization plugin already ships.
 * Everything below is Platterly's own module/action matrix — a representative
 * starting set proving the deny-by-default mechanism works end to end. Each
 * later chunk extends this statement with its own module's actions as that
 * module gets built (e.g. Chunk 9 adds `customers`/`events` actions beyond the
 * placeholders below, Chunk 14 adds `invoices`/`payments`, etc.). Chunk 5's
 * Team Admin / Manager / Staff preset UI is built on top of the `roles` below,
 * never a replacement for this granular engine.
 */
export const statement = {
  ...defaultStatements,
  // "delete" = Chunk 5's Danger Zone data purge — owner-only, granted to no
  // other role (see the `admin` role's comment above for why this must stay
  // exclusive even for an otherwise owner-level role).
  tenant: ["view", "edit", "delete"],
  users: ["view", "create", "edit", "delete"],
  customers: ["view", "create", "edit", "delete"],
  events: ["view", "create", "edit", "delete", "approve"],
  orders: ["view", "create", "edit", "delete"],
  menus: ["view", "create", "edit", "delete", "approve"],
  inventory: ["view", "create", "edit", "delete"],
  invoices: ["view", "create", "edit", "delete", "export"],
  payments: ["view", "create", "manage"],
  reports: ["view", "export"],
  settings: ["view", "edit"],
} as const;

export const ac = createAccessControl(statement);

/**
 * Base roles every tenant gets. Deny-by-default: any resource/action not
 * listed for a role is unauthorized (see permission tests in src/lib/auth/__tests__).
 * Super Admin is not an organization role at all — it's a separate, tenant-less
 * platform-level user (Chunk 3), enforced by an app-level check, not by this ac.
 */
export const roles = {
  owner: ac.newRole({
    ...ownerAc.statements,
    tenant: ["view", "edit", "delete"],
    users: ["view", "create", "edit", "delete"],
    customers: ["view", "create", "edit", "delete"],
    events: ["view", "create", "edit", "delete", "approve"],
    orders: ["view", "create", "edit", "delete"],
    menus: ["view", "create", "edit", "delete", "approve"],
    inventory: ["view", "create", "edit", "delete"],
    invoices: ["view", "create", "edit", "delete", "export"],
    payments: ["view", "create", "manage"],
    reports: ["view", "export"],
    settings: ["view", "edit"],
  }),
  /**
   * Chunk 5 Group 5.2 — the "Team Admin" invite preset. Owner-level access to
   * every business module (including team management, via
   * `adminOrganizationManagementGrants`), but explicitly excluded from
   * `tenant: ["delete"]` (Danger Zone) and from Better Auth's own
   * `organization: ["delete"]` — both irreversible, both owner-only forever.
   * Any future billing/payment-destructive action should follow the same
   * pattern: grant to owner, withhold from admin, by default.
   */
  admin: ac.newRole({
    ...adminOrganizationManagementGrants,
    tenant: ["view", "edit"],
    users: ["view", "create", "edit", "delete"],
    customers: ["view", "create", "edit", "delete"],
    events: ["view", "create", "edit", "delete", "approve"],
    orders: ["view", "create", "edit", "delete"],
    menus: ["view", "create", "edit", "delete", "approve"],
    inventory: ["view", "create", "edit", "delete"],
    invoices: ["view", "create", "edit", "delete", "export"],
    payments: ["view", "create", "manage"],
    reports: ["view", "export"],
    settings: ["view", "edit"],
  }),
  manager: ac.newRole({
    ...memberAc.statements,
    tenant: ["view"],
    users: ["view"],
    customers: ["view", "create", "edit"],
    events: ["view", "create", "edit"],
    orders: ["view", "create", "edit"],
    menus: ["view", "create", "edit"],
    inventory: ["view", "create", "edit"],
    invoices: ["view", "create"],
    payments: ["view", "create"],
    reports: ["view"],
    settings: ["view"],
  }),
  staff: ac.newRole({
    ...memberAc.statements,
    tenant: [],
    users: [],
    customers: ["view"],
    events: ["view"],
    orders: ["view"],
    menus: ["view"],
    inventory: ["view"],
    invoices: [],
    payments: [],
    reports: ["view"],
    settings: [],
  }),
};
