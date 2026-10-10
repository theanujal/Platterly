import { describe, it, expect } from "vitest";
import { buildInvoiceDocument, menuForDocument, type DocumentSource } from "../invoice-document";
import { renderInvoicePdf } from "../invoice-pdf";

const order = (overrides: Partial<DocumentSource["order"]> = {}): DocumentSource["order"] => ({
  orderNumber: "ORD-0001",
  total: 52272,
  discount: 0,
  eventStartDate: new Date("2025-12-16"),
  eventEndDate: new Date("2025-12-17"),
  venue: "Taj Hall",
  totalParticipants: 111,
  adultCount: 100,
  childBelow5Count: 6,
  child5To10Count: 5,
  eventType: { name: "Wedding" },
  mealPlanEntries: [
    {
      menu: { name: "Paneer Tikka" },
      items: [
        { name: "Paneer Tikka", itemType: "MENU_ITEM", isExtra: false, menuItem: { categories: [{ category: { name: "Starters" } }] } },
        { name: "Dal Makhani", itemType: "MENU_ITEM", isExtra: false, menuItem: { categories: [{ category: { name: "Main Course" } }] } },
        { name: "Gulab Jamun", itemType: "MENU_ITEM", isExtra: true, menuItem: { categories: [{ category: { name: "Desserts" } }] } },
        { name: "Chaat Counter", itemType: "ADD_ON", isExtra: false, menuItem: null },
      ],
    },
    { menu: { name: "Paneer Tikka" }, items: [{ name: "Paneer Tikka", itemType: "MENU_ITEM", isExtra: false, menuItem: { categories: [{ category: { name: "Starters" } }] } }] },
  ],
  ...overrides,
});

const source = (overrides: Partial<DocumentSource> = {}): DocumentSource => ({
  type: "INVOICE",
  number: "INV-0001",
  status: "SENT",
  issueDate: new Date("2025-11-25"),
  dueDate: new Date("2099-12-16"),
  customerName: "shiv k",
  customerPhone: "9876543210",
  customerAddress: "Whitefield, Bangalore",
  businessName: "test kitchen",
  businessAddress: "1 MG Road",
  businessGstNumber: null,
  gstEnabled: false,
  gstType: "CGST_SGST",
  gstRate: 0,
  taxableValue: 52272,
  cgst: 0,
  sgst: 0,
  igst: 0,
  total: 52272,
  terms: "Pay within 7 days.",
  notes: "Payment for shiv k",
  items: [{ description: "Paneer Tikka", detail: "Dinner, 16 Dec 2025", hsnSac: null, quantity: 100, rate: 522.72, amount: 52272 }],
  order: order(),
  ...overrides,
});

describe("invoice document", () => {
  it("groups the menu's dishes by category once each, marks extras, and lists add-ons last", () => {
    const menu = menuForDocument(order().mealPlanEntries);
    expect(menu?.name).toBe("Paneer Tikka");
    expect(menu?.groups).toEqual([
      { name: "Starters", items: ["Paneer Tikka"] },
      { name: "Main Course", items: ["Dal Makhani"] },
      { name: "Desserts", items: ["Gulab Jamun (Extra)"] },
      { name: "Add-ons & Live Counters", items: ["Chaat Counter"] },
    ]);
    expect(menuForDocument([])).toBeNull();
  });

  it("an unpaid invoice shows UNPAID, the guests (the whole party) and the sample's payment summary", () => {
    const doc = buildInvoiceDocument(source(), 0);
    expect(doc.title).toBe("INVOICE");
    expect(doc.status).toEqual({ label: "UNPAID", tone: "info" });
    expect(doc.event.guests).toBe(111);
    expect(doc.orderNumber).toBe("ORD-0001");
    expect(doc.summary.map((r) => [r.label, r.value])).toEqual([["Original Amount", 52272], ["Total After Discount", 52272], ["Amount Paid", 0], ["Balance Due", 52272]]);
  });

  it("a discount is shown between the original amount and the total, and payments reduce the balance", () => {
    const doc = buildInvoiceDocument(source({ total: 50000, order: order({ discount: 2272, total: 50000 }), status: "PARTIALLY_PAID" }), 20000);
    expect(doc.status.label).toBe("PARTIALLY PAID");
    expect(doc.summary.map((r) => [r.label, r.value])).toEqual([["Original Amount", 52272], ["Discount", 2272], ["Total After Discount", 50000], ["Amount Paid", 20000], ["Balance Due", 30000]]);
  });

  it("a paid invoice reads PAID with nothing due, and an unpaid one past its due date reads OVERDUE", () => {
    expect(buildInvoiceDocument(source({ status: "PAID" }), 52272).summary.at(-1)?.value).toBe(0);
    expect(buildInvoiceDocument(source({ status: "PAID" }), 52272).status.label).toBe("PAID");
    expect(buildInvoiceDocument(source({ dueDate: new Date("2020-01-01") }), 0).status.label).toBe("OVERDUE");
  });

  it("a receipt acknowledges one payment against the order", () => {
    const doc = buildInvoiceDocument(source({ type: "RECEIPT", number: "RCT-0001", total: 20000 }), 20000);
    expect(doc.title).toBe("RECEIPT");
    expect(doc.dueDate).toBeNull();
    expect(doc.status.label).toBe("PAID");
    expect(doc.summary.map((r) => [r.label, r.value])).toEqual([["Order Total", 52272], ["Received (this receipt)", 20000], ["Total Paid So Far", 20000], ["Balance Due", 32272]]);
  });

  it("the PDF is built from the same document and carries the Platterly branding", () => {
    const bytes = renderInvoicePdf(buildInvoiceDocument(source(), 0));
    const text = Buffer.from(bytes).toString("latin1");
    expect(text.startsWith("%PDF")).toBe(true);
    for (const needle of ["test kitchen", "Powered by", "Platterly", "Selected Menu & Food Items", "Payment Summary", "INV-0001"]) expect(text).toContain(needle);
  });
});
