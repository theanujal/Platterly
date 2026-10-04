import type { statement } from "@/lib/auth/permissions";

type Needs = { [R in keyof typeof statement]?: (typeof statement)[R][number][] };

/**
 * Sidebar entries that hold several pages as tabs (AJ, 2026-10-04). Each page keeps its own address, so links, exports
 * and bookmarks keep working; the group only decides the menu name and which tabs a role sees. A tab is shown to a
 * role only when it could open that page, and the menu entry opens the first tab the role is allowed.
 */
export const NAV_GROUPS = {
  reports: {
    label: "Reports & Activity",
    tabs: [
      { label: "Reports", href: "/reports", needs: { reports: ["view"] } as Needs },
      { label: "Activity", href: "/audit-log", needs: { audit: ["view"] } as Needs },
    ],
  },
  finance: {
    label: "Finance",
    tabs: [
      { label: "Expenses", href: "/expenses", needs: { expenses: ["view"] } as Needs },
      { label: "Profitability", href: "/profitability", needs: { expenses: ["view"] } as Needs },
    ],
  },
  stock: {
    label: "Stock & Supplies",
    tabs: [
      { label: "Inventory", href: "/inventory", needs: { inventory: ["view"] } as Needs },
      { label: "Suppliers", href: "/suppliers", needs: { inventory: ["view"] } as Needs },
      { label: "Purchasing", href: "/purchasing", needs: { inventory: ["view"] } as Needs },
    ],
  },
} as const;

export type NavGroupId = keyof typeof NAV_GROUPS;
