import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Chunk 23 — a person held to a location is held on Server Actions too, not just on the pages that link to them
 * (an action is an open endpoint, so a hand-made call with another location's id must be refused). This reads the
 * source of every action file that touches location-bound records and fails when an exported action takes a
 * record by id without a location check, unless it is on the short list of actions that deliberately have none
 * (creating something new, or records that belong to no location).
 */
const FILES = [
  "orders/actions.ts",
  "invoices/actions.ts",
  "kitchen-dashboard/actions.ts",
  "kitchen-dashboard/production/actions.ts",
  "menu-approvals/actions.ts",
  "profitability/actions.ts",
  "purchasing/actions.ts",
  "staff/actions.ts",
  "staff/event-ops-actions.ts",
  "inventory/actions.ts",
];

/** No location check on purpose: new records (they take the person's own location), lookups, and things with no location. */
const NO_LOCATION = new Set([
  "createOrderAction",
  "createOrderAndNotifyAction",
  "searchCustomersAction",
  "createCustomerForOrderAction",
  "getMenuForOrderPickerAction",
  "getOrderCountsByDayAction",
  "getMenuForApprovalPickerAction",
  "createRecurringExpenseAction",
  "updateRecurringExpenseAction",
  "setRecurringExpenseActiveAction",
  "deleteRecurringExpenseAction",
  "createPurchaseOrderAction",
  "recordSupplierPaymentAction",
  "deleteSupplierPaymentAction",
  "createStaffMemberAction",
  "updateStaffMemberAction",
  "deleteStaffMemberAction",
  "createInventoryItemAction",
]);

function actionsIn(file: string): { name: string; body: string }[] {
  const text = readFileSync(path.join(process.cwd(), "src/app/(app)", file), "utf8");
  return text
    .split(/\n(?=export async function )/)
    .slice(1)
    .map((part) => ({ name: /^export async function (\w+)/.exec(part)![1], body: part }));
}

describe("location checks on Server Actions", () => {
  for (const file of FILES) {
    it(`${file}: every action that takes a record checks its location`, () => {
      const unchecked = actionsIn(file).filter((a) => !NO_LOCATION.has(a.name) && !/AtMyLocation|assertMayMoveEventTo/.test(a.body));
      expect(unchecked.map((a) => a.name)).toEqual([]);
    });
  }

  it("the allow-list only names actions that exist (so it cannot hide a renamed one)", () => {
    const all = new Set(FILES.flatMap((f) => actionsIn(f).map((a) => a.name)));
    expect([...NO_LOCATION].filter((n) => !all.has(n))).toEqual([]);
  });

  it("a person held to a location cannot move an event away, and creates events and items at their own location", () => {
    const orders = readFileSync(path.join(process.cwd(), "src/app/(app)/orders/actions.ts"), "utf8");
    expect(orders).toMatch(/assertMayMoveEventTo/);
    expect((orders.match(/myHeldLocation\(organizationId, session\.user\.id\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    const inventory = readFileSync(path.join(process.cwd(), "src/app/(app)/inventory/actions.ts"), "utf8");
    expect(inventory).toMatch(/if \(held\) input\.kitchenId = held/);
  });
});
