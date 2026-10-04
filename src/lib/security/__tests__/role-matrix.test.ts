import { describe, it, expect } from "vitest";
import { roles, statement } from "@/lib/auth/permissions";

/**
 * Chunk 17.3 — RBAC boundary tests. The full grant table for every role, written out. Any change to who can do what
 * fails here first, so it has to be a deliberate edit of this table (and a conscious security decision).
 */
const EXPECTED: Record<string, Record<string, string[]>> = {
  "owner": {
    "staffing": ["view","create","edit","delete"],
    "tenant": [
      "view",
      "edit",
      "delete"
    ],
    "users": [
      "view",
      "create",
      "edit",
      "delete"
    ],
    "customers": [
      "view",
      "create",
      "edit",
      "delete"
    ],
    "eventTypes": [
      "view",
      "create",
      "edit",
      "delete"
    ],
    "orders": [
      "view",
      "create",
      "edit",
      "delete",
      "bypass_date_restriction"
    ],
    "quotations": [
      "view",
      "create",
      "edit",
      "delete"
    ],
    "menus": [
      "view",
      "create",
      "edit",
      "delete",
      "approve"
    ],
    "inventory": [
      "view",
      "create",
      "edit",
      "delete"
    ],
    "invoices": [
      "view",
      "create",
      "edit",
      "delete",
      "export"
    ],
    "payments": [
      "view",
      "create",
      "manage"
    ],
    "expenses": [
      "view",
      "create",
      "edit",
      "delete"
    ],
    "reports": [
      "view",
      "export"
    ],
    "audit": [
      "view"
    ],
    "settings": [
      "view",
      "edit"
    ]
  },
  "manager": {
    "staffing": ["view","create","edit"],
    "tenant": [
      "view"
    ],
    "users": [
      "view"
    ],
    "customers": [
      "view",
      "create",
      "edit"
    ],
    "eventTypes": [
      "view",
      "create",
      "edit"
    ],
    "orders": [
      "view",
      "create",
      "edit"
    ],
    "quotations": [
      "view",
      "create",
      "edit"
    ],
    "menus": [
      "view",
      "create",
      "edit"
    ],
    "inventory": [
      "view",
      "create",
      "edit"
    ],
    "invoices": [
      "view",
      "create"
    ],
    "payments": [
      "view",
      "create"
    ],
    "expenses": [
      "view",
      "create",
      "edit"
    ],
    "reports": [
      "view",
      "export"
    ],
    "audit": [
      "view"
    ],
    "settings": [
      "view"
    ]
  },
  "staff": {
    "staffing": ["view"],
    "customers": [
      "view"
    ],
    "eventTypes": [
      "view"
    ],
    "orders": [
      "view"
    ],
    "quotations": [
      "view"
    ],
    "menus": [
      "view"
    ],
    "inventory": [
      "view"
    ],
    "reports": [
      "view",
      "export"
    ]
  },
  "kitchen": {
    "staffing": ["view","create","edit","delete"],
    "eventTypes": [
      "view"
    ],
    "orders": [
      "view"
    ],
    "menus": [
      "view",
      "edit"
    ]
  },
  "inventoryTeam": {
    "inventory": [
      "view",
      "create",
      "edit",
      "delete"
    ],
    "reports": [
      "view",
      "export"
    ]
  },
  "accounts": {
    "invoices": [
      "view",
      "create",
      "edit",
      "export"
    ],
    "payments": [
      "view",
      "create",
      "manage"
    ],
    "expenses": [
      "view",
      "create",
      "edit"
    ],
    "reports": [
      "view",
      "export"
    ]
  },
  "salesEvents": {
    "staffing": ["view"],
    "customers": [
      "view",
      "create",
      "edit"
    ],
    "eventTypes": [
      "view",
      "create",
      "edit"
    ],
    "orders": [
      "view",
      "create",
      "edit"
    ],
    "quotations": [
      "view",
      "create",
      "edit"
    ],
    "menus": [
      "view",
      "approve"
    ],
    "reports": [
      "view",
      "export"
    ]
  }
};

const BUSINESS_RESOURCES = Object.keys(statement).filter((k) => !["organization", "member", "invitation", "team", "ac"].includes(k));

function grants(role: keyof typeof roles) {
  const out: Record<string, string[]> = {};
  for (const resource of BUSINESS_RESOURCES) {
    const actions = (statement as Record<string, readonly string[]>)[resource];
    const allowed = actions.filter((a) => (roles[role] as { authorize: (x: unknown) => { success: boolean } }).authorize({ [resource]: [a] }).success);
    if (allowed.length) out[resource] = allowed;
  }
  return out;
}

describe("role permission matrix", () => {
  it("covers exactly the seven roles", () => {
    expect(Object.keys(roles).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.keys(EXPECTED))("%s has exactly the grants in the table, nothing more", (role) => {
    expect(grants(role as keyof typeof roles)).toEqual(EXPECTED[role]);
  });

  it("only the owner can purge data, delete users, change settings or bypass the date rule", () => {
    for (const role of Object.keys(EXPECTED).filter((r) => r !== "owner")) {
      const g = EXPECTED[role];
      expect(g.tenant ?? [], `${role} tenant`).not.toContain("delete");
      expect(g.tenant ?? [], `${role} tenant`).not.toContain("edit");
      expect(g.users ?? [], `${role} users`).not.toContain("delete");
      expect(g.settings ?? [], `${role} settings`).not.toContain("edit");
      expect(g.orders ?? [], `${role} orders`).not.toContain("bypass_date_restriction");
      expect(g.orders ?? [], `${role} orders`).not.toContain("delete");
    }
  });

  it("no role below the owner can delete any business record, except a team in its own domain (inventory team: inventory; kitchen team: staff records)", () => {
    for (const role of Object.keys(EXPECTED).filter((r) => r !== "owner" && r !== "inventoryTeam")) {
      for (const [resource, actions] of Object.entries(EXPECTED[role])) {
        if (role === "kitchen" && resource === "staffing") continue;
        expect(actions, `${role} ${resource}`).not.toContain("delete");
      }
    }
  });

  it("only the owner and manager can read the Audit Log", () => {
    for (const role of Object.keys(EXPECTED)) {
      const canSee = (EXPECTED[role].audit ?? []).includes("view");
      expect(canSee, role).toBe(role === "owner" || role === "manager");
    }
  });

  it("the read-only Staff role can only view (and download the reports it can already read)", () => {
    for (const [resource, actions] of Object.entries(EXPECTED.staff)) expect(actions).toEqual(resource === "reports" ? ["view", "export"] : ["view"]);
  });

  it("Kitchen cannot touch money or customers; Accounts cannot touch orders or menus", () => {
    for (const resource of ["invoices", "payments", "expenses", "customers", "quotations", "settings"]) expect(EXPECTED.kitchen[resource]).toBeUndefined();
    for (const resource of ["orders", "menus", "customers", "quotations", "inventory"]) expect(EXPECTED.accounts[resource]).toBeUndefined();
  });

  it("every role is denied a resource that does not exist", () => {
    for (const role of Object.keys(roles)) {
      // @ts-expect-error — deliberately unknown resource: deny by default
      expect(roles[role as keyof typeof roles].authorize({ nonexistent: ["view"] }).success).toBe(false);
    }
  });
});
