import { describe, it, expect } from "vitest";
import { NAV_PERMISSIONS, withoutSupersededEntries } from "../nav-permissions";

describe("withoutSupersededEntries (Menu Approvals + Orders merge, Phase 4)", () => {
  it("drops the old Menu Approvals entry for a role that can open Orders", () => {
    expect(withoutSupersededEntries(["/orders", "/menu-approvals", "/calendar"])).toEqual(["/orders", "/calendar"]);
  });

  it("keeps it for a role that can approve menus but cannot open Orders (its only way in)", () => {
    expect(withoutSupersededEntries(["/menu-approvals", "/kitchen-dashboard"])).toEqual(["/menu-approvals", "/kitchen-dashboard"]);
  });

  it("changes nothing for a role without the approval permission, and never touches other links", () => {
    expect(withoutSupersededEntries(["/orders", "/customers"])).toEqual(["/orders", "/customers"]);
    expect(withoutSupersededEntries([])).toEqual([]);
  });

  it("the queue still needs the approve permission, and Orders the view permission", () => {
    expect(NAV_PERMISSIONS["/menu-approvals"]).toEqual({ menus: ["approve"] });
    expect(NAV_PERMISSIONS["/orders"]).toEqual({ orders: ["view"] });
  });
});
