import { describe, it, expect } from "vitest";
import { roles } from "@/lib/auth/permissions";
import { MATRIX_MODULES, SENSITIVE_KEYS, sanitizeGrants } from "@/lib/auth/role-matrix";
import {
  ACCESS_MODULES,
  COMING_SOON,
  MODULE_GROUPS,
  SENSITIVE_INFO,
  actionsOf,
  changedModules,
  hasAccess,
  isAllowed,
  sameGrants,
  setAccess,
  setSensitive,
  summarize,
  toggleAction,
  type Grants,
} from "@/lib/auth/role-editor";

/** The built-in grants of a role limited to the editable modules (the same shape `defaultGrants` gives the server). */
function preset(roleId: keyof typeof roles): Grants {
  const statements = roles[roleId].statements as Record<string, readonly string[] | undefined>;
  return Object.fromEntries(MATRIX_MODULES.map((m) => [m.key, [...(statements[m.key] ?? [])].filter((a) => (m.actions as readonly string[]).includes(a))]));
}
const empty = (): Grants => Object.fromEntries(MATRIX_MODULES.map((m) => [m.key, []]));

describe("the three views cover the matrix exactly once", () => {
  it("every access module is in exactly one group, and groups name only real modules", () => {
    const grouped = MODULE_GROUPS.flatMap((g) => g.keys);
    expect([...grouped].sort()).toEqual(ACCESS_MODULES.map((m) => m.key).sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("every permission is on one tab: View on Module Access, the other actions on Actions, the eight keys on Sensitive Data", () => {
    for (const mod of ACCESS_MODULES) {
      expect(mod.actions).toContain("view");
      expect([...mod.actions].sort()).toEqual(["view", ...actionsOf(mod.key)].sort());
    }
    const sensitive = MATRIX_MODULES.find((m) => m.key === "sensitive")!;
    expect([...sensitive.actions].sort()).toEqual([...SENSITIVE_KEYS].sort());
    for (const key of SENSITIVE_KEYS) {
      expect(SENSITIVE_INFO[key].label.length).toBeGreaterThan(3);
      expect(SENSITIVE_INFO[key].covers.length).toBeGreaterThan(10);
    }
  });

  it("stock requests are Coming soon only: listed, but not part of the saved matrix", () => {
    expect(COMING_SOON.map((c) => c.id)).toEqual(["stockRequests:request", "stockRequests:fulfil", "stockRequests:receive"]);
    expect(MATRIX_MODULES.some((m) => (m.key as string) === "stockRequests")).toBe(false);
  });
});

describe("editing rules (unchanged from before the redesign)", () => {
  it("turning a module on grants View only, and never an action", () => {
    const g = setAccess(empty(), "orders", true);
    expect(g.orders).toEqual(["view"]);
    expect(summarize(g).actionsOn).toBe(0);
  });

  it("ticking an action turns the module's View on too", () => {
    const g = toggleAction(empty(), "customers", "edit", true);
    expect(g.customers).toEqual(["view", "edit"]);
    expect(hasAccess(g, "customers")).toBe(true);
  });

  it("unticking an action keeps View and the other actions; turning the module off clears everything in it", () => {
    let g = toggleAction(toggleAction(empty(), "orders", "create", true), "orders", "edit", true);
    g = toggleAction(g, "orders", "create", false);
    expect(g.orders).toEqual(["view", "edit"]);
    g = setAccess(g, "orders", false);
    expect(g.orders).toEqual([]);
  });

  it("specials work the same way: Approve on Menus and Update cooking status on Kitchen turn View on", () => {
    expect(toggleAction(empty(), "menus", "approve", true).menus).toEqual(["view", "approve"]);
    expect(toggleAction(empty(), "kitchen", "updateStatus", true).kitchen).toEqual(["view", "updateStatus"]);
  });

  it("sensitive data is independent of module access, in both directions", () => {
    const withKeys = setSensitive(setSensitive(empty(), "orderPrices", true), "paymentDetails", true);
    expect(withKeys.sensitive).toEqual(["orderPrices", "paymentDetails"]);
    expect(summarize(withKeys).modulesOn).toBe(0); // keys never switch a module on
    const modulesOnly = setAccess(setAccess(withKeys, "orders", true), "orders", false);
    expect(modulesOnly.sensitive).toEqual(["orderPrices", "paymentDetails"]); // a module never switches a key off
    expect(setSensitive(withKeys, "orderPrices", false).sensitive).toEqual(["paymentDetails"]);
  });

  it("unknown modules are ignored, and everything the editor produces is already what the server would store", () => {
    expect(toggleAction(empty(), "tenant", "delete", true)).toEqual(empty());
    let g = empty();
    for (const [key, action] of [["orders", "edit"], ["menus", "approve"], ["kitchen", "viewPdf"], ["reports", "export"], ["inventory", "delete"]]) g = toggleAction(g, key, action, true);
    g = setAccess(g, "inventory", false);
    g = setSensitive(g, "profitability", true);
    const stored = sanitizeGrants(g);
    for (const mod of MATRIX_MODULES) expect(stored[mod.key]).toEqual(g[mod.key]);
  });
});

describe("loading existing permissions", () => {
  it("shows a built-in preset exactly: Kitchen Team", () => {
    const g = preset("kitchen");
    expect(hasAccess(g, "kitchen")).toBe(true);
    expect(isAllowed(g, "kitchen", "updateStatus")).toBe(true);
    expect(isAllowed(g, "kitchen", "viewPdf")).toBe(true);
    expect(hasAccess(g, "orders")).toBe(false); // Kitchen never implies Orders
    expect(hasAccess(g, "menus")).toBe(false); // ...or Menu Catalog
    expect(summarize(g)).toEqual({ modulesOn: 3, modulesTotal: 14, actionsOn: 7, sensitiveOn: 0, sensitiveTotal: 8 });
  });

  it("shows Accounts with its four sensitive keys, and Manager with none", () => {
    expect(summarize(preset("accounts"))).toEqual({ modulesOn: 6, modulesTotal: 14, actionsOn: 8, sensitiveOn: 4, sensitiveTotal: 8 });
    expect(preset("accounts").sensitive.sort()).toEqual(["commercialDocuments", "financialReports", "orderPrices", "paymentDetails"]);
    expect(summarize(preset("manager")).sensitiveOn).toBe(0);
  });

  it("tells a changed role from its preset, and which modules changed", () => {
    const defaults = preset("staff");
    expect(sameGrants(defaults, preset("staff"))).toBe(true);
    const edited = setSensitive(toggleAction(defaults, "customers", "edit", true), "orderPrices", true);
    expect(sameGrants(edited, defaults)).toBe(false);
    expect(changedModules(edited, defaults)).toEqual(["customers", "sensitive"]);
    expect(changedModules(defaults, defaults)).toEqual([]);
  });

  it("treats a module missing from the grants as no access", () => {
    expect(hasAccess({}, "orders")).toBe(false);
    expect(summarize({}).modulesOn).toBe(0);
  });
});
