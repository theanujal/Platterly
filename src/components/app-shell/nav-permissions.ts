import type { statement } from "@/lib/auth/permissions";

type Needs = { [R in keyof typeof statement]?: (typeof statement)[R][number][] };

/**
 * The permission each sidebar link needs, the same one its page checks with `requirePermission`.
 * The app layout resolves these for the signed-in role and passes the allowed hrefs to the
 * sidebar. The Dashboard has no entry: every role may open it.
 */
export const NAV_PERMISSIONS: Record<string, Needs> = {
  "/orders": { orders: ["view"] },
  "/calendar": { orders: ["view"] },
  "/abandoned-orders": { orders: ["view"] },
  "/quotations": { quotations: ["view"] },
  "/invoices": { invoices: ["view"] },
  "/expenses": { expenses: ["view"] },
  "/profitability": { expenses: ["view"] },
  "/overdue-payments": { payments: ["view"] },
  "/reports": { reports: ["view"] },
  "/customers": { customers: ["view"] },
  "/menu-catalog": { menus: ["view"] },
  "/inventory": { inventory: ["view"] },
  "/suppliers": { inventory: ["view"] },
  "/purchasing": { inventory: ["view"] },
  "/recipes": { inventory: ["view"] },
  "/menu-approvals": { menus: ["approve"] },
  "/kitchen-dashboard": { menus: ["view"] },
  "/staff": { staffing: ["view"] },
  "/audit-log": { audit: ["view"] },
  "/settings": { settings: ["view"] },
};

/**
 * Menu Approvals + Orders merge, Phase 4: Orders is the way into menu approval (its Menu Approval column, filter and Past view,
 * and the approval tab on each order). The old "Menu Approvals" queue stays in the sidebar only for a role that can approve menus
 * but cannot open the Orders list, because it is that role's only way in. Each page still enforces its own permission.
 */
export function withoutSupersededEntries(allowedHrefs: string[]): string[] {
  return allowedHrefs.includes("/orders") ? allowedHrefs.filter((href) => href !== "/menu-approvals") : allowedHrefs;
}
