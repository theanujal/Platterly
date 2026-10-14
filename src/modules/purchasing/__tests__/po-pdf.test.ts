import { describe, it, expect } from "vitest";
import { poPricing, renderPurchaseOrderPdf, type PoPdfSource } from "../po-pdf";

const base = (over: Partial<PoPdfSource> = {}): PoPdfSource => ({
  businessName: "Annapoorna Caterers",
  number: "PO-0007",
  status: "ORDERED",
  createdAt: new Date("2026-10-10T08:00:00Z"),
  orderedAt: new Date("2026-10-11T08:00:00Z"),
  expectedDate: new Date("2026-10-15T00:00:00Z"),
  notes: "Deliver before 7 am.",
  supplier: { name: "Sujatha Meat Shop", contactPerson: "Ravi", phone: "+919800000001", email: "ravi@example.test", address: "12 Market Road, Pune", gstin: "27ABCDE1234F1Z5" },
  lines: [
    { name: "Mutton (Bone-in)", unit: "kg", quantity: 33, receivedQuantity: 0, unitCost: 0 },
    { name: "Chicken (Boneless)", unit: "kg", quantity: 10.5, receivedQuantity: 0, unitCost: 0 },
  ],
  ...over,
});

const text = (po: PoPdfSource) => Buffer.from(renderPurchaseOrderPdf(po)).toString("latin1");
const pages = (pdf: string) => (pdf.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;

describe("purchase order PDF", () => {
  it("is a PDF with the branding, number, date, status, supplier, items, quantities, units and notes", () => {
    const pdf = text(base());
    expect(pdf.startsWith("%PDF")).toBe(true);
    for (const needle of ["Annapoorna Caterers", "Purchase Order", "PO-0007", "10 Oct 2026", "Ordered", "Sujatha Meat Shop", "ravi@example.test", "12 Market Road", "27ABCDE1234F1Z5", "Mutton \\(Bone-in\\)", "33 kg", "10.5 kg", "Deliver before 7 am.", "Powered by", "Platterly"]) {
      expect(pdf, needle).toContain(needle);
    }
  });

  it("an unpriced order shows no money at all: no Rs. 0.00, no total, and says so", () => {
    const pdf = text(base());
    expect(pdf).not.toMatch(/Rs\. ?0\.00/);
    expect(pdf).not.toContain("Unit cost");
    expect(pdf).not.toContain("Order total");
    expect(pdf).toContain("Not yet priced");
  });

  it("a fully priced order shows each saved unit cost and amount and the total", () => {
    const pdf = text(base({ lines: [{ name: "Rice", unit: "kg", quantity: 20, receivedQuantity: 0, unitCost: 55.5 }, { name: "Dal", unit: "kg", quantity: 4, receivedQuantity: 0, unitCost: 120 }] }));
    for (const needle of ["Rs. 55.50", "Rs. 1,110.00", "Rs. 120.00", "Rs. 480.00", "Order total: Rs. 1,590.00"]) expect(pdf, needle).toContain(needle);
  });

  it("a part-priced order marks the unpriced lines 'Not priced' and shows no total", () => {
    const lines = [{ name: "Rice", unit: "kg", quantity: 20, receivedQuantity: 0, unitCost: 55 }, { name: "Dal", unit: "kg", quantity: 4, receivedQuantity: 0, unitCost: 0 }];
    const pdf = text(base({ lines }));
    expect(poPricing(lines)).toMatchObject({ anyPriced: true, allPriced: false, total: null });
    expect(pdf).toContain("Not priced");
    expect(pdf).toContain("Total not shown");
    expect(pdf).not.toContain("Order total");
    expect(pdf).not.toMatch(/Rs\. ?0\.00/);
  });

  it("the status is the order's own, and received quantities appear once something has arrived", () => {
    const lines = [{ name: "Rice", unit: "kg", quantity: 20, receivedQuantity: 8, unitCost: 0 }];
    expect(text(base({ status: "DRAFT", orderedAt: null, lines }))).not.toContain("Received");
    const partly = text(base({ status: "PARTIALLY_RECEIVED", lines }));
    expect(partly).toContain("Partly received");
    expect(partly).toContain("Received");
    expect(partly).toContain("8 kg");
    expect(text(base({ status: "DRAFT", orderedAt: null }))).toContain("Draft");
    expect(text(base({ status: "CANCELLED" }))).toContain("Cancelled");
    expect(text(base({ status: "RECEIVED", lines }))).toContain("Received");
  });

  it("many lines and very long names flow onto more pages without losing a line, with a footer on each page", () => {
    const lines = Array.from({ length: 70 }, (_, i) => ({ name: `Item ${i + 1} ${"extra-long-ingredient-name ".repeat(5)}`.trim(), unit: "kg", quantity: i + 1, receivedQuantity: 0, unitCost: 0 }));
    const pdf = text(base({ lines, notes: "N ".repeat(600) }));
    expect(pages(pdf)).toBeGreaterThan(1);
    expect(pdf).toContain("Item 1 ");
    expect(pdf).toContain("Item 70 ");
    expect(pdf).toContain(`Page ${pages(pdf)} of ${pages(pdf)}`);
  });

  it("works without optional details (no contact, notes or dates)", () => {
    const pdf = text(base({ notes: null, orderedAt: null, expectedDate: null, supplier: { name: "Plain Supplier", contactPerson: null, phone: null, email: null, address: null, gstin: null } }));
    expect(pdf).toContain("Plain Supplier");
    expect(pdf).not.toContain("NOTES");
    expect(pdf).not.toContain("Expected:");
  });
});
