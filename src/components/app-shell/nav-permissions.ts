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
  "/reports": { reports: ["view"] },
  "/customers": { customers: ["view"] },
  "/menu-catalog": { menus: ["view"] },
  "/inventory": { inventory: ["view"] },
  "/suppliers": { inventory: ["view"] },
  "/purchasing": { inventory: ["view"] },
  "/menu-approvals": { menus: ["approve"] },
  "/kitchen-dashboard": { menus: ["view"] },
  "/audit-log": { audit: ["view"] },
  "/settings": { settings: ["view"] },
};
