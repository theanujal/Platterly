import { describe, it, expect } from "vitest";
import { describeAction, describeActor, diffAudit, recordHref } from "../audit-text";

describe("describeAction", () => {
  it("uses plain words for known actions", () => {
    expect(describeAction("order.create")).toBe("Order created");
    expect(describeAction("tenant.data_purge")).toBe("All data deleted (Danger Zone)");
  });

  it("makes a readable guess for an action it does not know", () => {
    expect(describeAction("menu_item.duplicate")).toBe("Food item: duplicate");
    expect(describeAction("brand_new.thing_happened")).toBe("Brand new: thing happened");
    expect(describeAction("standalone")).toBe("Standalone");
  });
});

describe("describeActor", () => {
  it("names the person, else the customer for a no-login link, else the system", () => {
    expect(describeActor("Asha Rao", "order.create")).toBe("Asha Rao");
    expect(describeActor(null, "menu_selection.customer_approved_via_link")).toBe("Customer");
    expect(describeActor(null, "quotation.accept")).toBe("Customer");
    expect(describeActor(undefined, "recurring_expense.generate")).toBe("System");
  });
});

describe("diffAudit", () => {
  it("lists only what changed, skipping ids and timestamps", () => {
    const changes = diffAudit({ id: "1", name: "Old", price: 100, updatedAt: "a" }, { id: "1", name: "New", price: 100, updatedAt: "b" });
    expect(changes).toEqual([{ field: "Name", before: "Old", after: "New" }]);
  });

  it("for a create (no before) lists the fields that were filled in", () => {
    const changes = diffAudit(null, { id: "1", name: "Paneer", description: "", price: 250, status: null });
    expect(changes.map((c) => c.field)).toEqual(["Name", "Price"]);
    expect(changes[1]).toEqual({ field: "Price", before: "—", after: "250" });
  });

  it("never shows a secret, token or password", () => {
    const changes = diffAudit({ razorpayKeySecret: "abc", apiKey: "k1", webhookSecret: "w", note: "x" }, { razorpayKeySecret: "def", apiKey: "k2", webhookSecret: "w2", note: "y" });
    const text = JSON.stringify(changes);
    for (const secret of ["abc", "def", "k1", "k2", "w2"]) expect(text).not.toContain(`"${secret}"`);
    expect(changes.find((c) => c.field === "Razorpay Key Secret")).toMatchObject({ before: "••••", after: "••••" });
    expect(changes.find((c) => c.field === "Note")).toMatchObject({ before: "x", after: "y" });
  });

  it("shortens very long values, caps the number of rows, and copes with nothing", () => {
    const long = diffAudit({ a: "x".repeat(500) }, { a: "y" });
    expect(long[0].before.length).toBeLessThan(200);
    const many = diffAudit({}, Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, i + 1])));
    expect(many).toHaveLength(14);
    expect(diffAudit(null, null)).toEqual([]);
    expect(diffAudit([1], "text")).toEqual([]);
  });
});

describe("recordHref", () => {
  it("links the records that have a page, and no others", () => {
    expect(recordHref("Order", "abc")).toBe("/orders/abc");
    expect(recordHref("Customer", "abc")).toBe("/customers/abc");
    expect(recordHref("MenuSelection", "abc")).toBeNull();
  });
});
