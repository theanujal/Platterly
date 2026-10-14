import { describe, it, expect } from "vitest";
import { checkReceiptHeader, checkReceiptLine, checkUnitCost, defaultTracksExpiry, ReceiptError } from "../receipt-rules";

const today = new Date(Date.UTC(2026, 9, 15));
const day = (n: number) => new Date(today.getTime() + n * 86_400_000);
const header = (over: Partial<Parameters<typeof checkReceiptHeader>[0]> = {}) => ({ receivedDate: today, today, orderPlacedAt: new Date(2026, 9, 10), idempotencyKey: "k", ...over });
const line = (over: Partial<Parameters<typeof checkReceiptLine>[0]> = {}) => ({ name: "Paneer", tracksExpiry: false, remaining: 10, quantity: 5, unitCost: 40, receivedDate: today, today, ...over });

describe("receipt header rules", () => {
  it("accepts today, a past date after the order, an optional invoice and notes", () => {
    expect(() => checkReceiptHeader(header())).not.toThrow();
    expect(() => checkReceiptHeader(header({ receivedDate: day(-3), invoiceNumber: "INV-1", notes: "all good" }))).not.toThrow();
  });
  it("refuses a future date, a date before the order was raised, a missing key and long text", () => {
    expect(() => checkReceiptHeader(header({ receivedDate: day(1) }))).toThrow(/future/);
    expect(() => checkReceiptHeader(header({ receivedDate: day(-6) }))).toThrow(/before the order/);
    expect(() => checkReceiptHeader(header({ idempotencyKey: "" }))).toThrow(ReceiptError);
    expect(() => checkReceiptHeader(header({ invoiceNumber: "x".repeat(61) }))).toThrow(/invoice/);
    expect(() => checkReceiptHeader(header({ notes: "x".repeat(1001) }))).toThrow(/notes/);
    expect(() => checkReceiptHeader(header({ receivedDate: new Date(Number.NaN) }))).toThrow(/date/);
  });
});

describe("receipt line rules", () => {
  it("accepts a valid line, up to exactly what is still to arrive", () => {
    expect(() => checkReceiptLine(line())).not.toThrow();
    expect(() => checkReceiptLine(line({ quantity: 10 }))).not.toThrow();
  });
  it("over-delivery is refused unless the extra is authorised with a reason", () => {
    expect(() => checkReceiptLine(line({ quantity: 10.5 }))).toThrow(/authorise/);
    expect(() => checkReceiptLine(line({ quantity: 10.5, extraReason: "  " }))).toThrow(ReceiptError);
    expect(() => checkReceiptLine(line({ quantity: 10.5, extraReason: "Supplier top-up" }))).not.toThrow();
    expect(() => checkReceiptLine(line({ quantity: 10.5, extraReason: "x".repeat(301) }))).toThrow(/too long/);
  });
  it("a unit cost is required; negative is refused; zero is only accepted as confirmed free goods with a reason", () => {
    expect(() => checkReceiptLine(line({ quantity: 0 }))).toThrow(/quantity/);
    expect(() => checkReceiptLine(line({ unitCost: Number.NaN }))).toThrow(/unit cost/);
    expect(() => checkReceiptLine(line({ unitCost: -1 }))).toThrow(/negative/);
    expect(() => checkReceiptLine(line({ unitCost: 0 }))).toThrow(/free/);
    expect(() => checkReceiptLine(line({ unitCost: 0, costNote: "Free sample" }))).not.toThrow();
    expect(() => checkReceiptLine(line({ unitCost: 20_000_000 }))).toThrow(/too large/);
    expect(() => checkReceiptLine(line({ lotNumber: "x".repeat(61) }))).toThrow(/lot/);
  });
  it("the same cost rule serves manual Stock In", () => {
    expect(() => checkUnitCost("Rice", 12)).not.toThrow();
    expect(() => checkUnitCost("Rice", 0)).toThrow(/free/);
    expect(() => checkUnitCost("Rice", 0, "Donated")).not.toThrow();
    expect(() => checkUnitCost("Rice", -0.01)).toThrow(/negative/);
  });
  it("expiry: required when the item tracks it, optional otherwise, never before receipt and never already past", () => {
    expect(() => checkReceiptLine(line({ tracksExpiry: true }))).toThrow(/expiry date/);
    expect(() => checkReceiptLine(line({ tracksExpiry: true, expiryDate: day(5) }))).not.toThrow();
    expect(() => checkReceiptLine(line({ tracksExpiry: false }))).not.toThrow();
    expect(() => checkReceiptLine(line({ expiryDate: day(2) }))).not.toThrow();
    expect(() => checkReceiptLine(line({ expiryDate: day(-1), receivedDate: day(-2) }))).toThrow(/already expired/);
    expect(() => checkReceiptLine(line({ expiryDate: day(3), receivedDate: day(4) }))).toThrow(/before the received/);
    expect(() => checkReceiptLine(line({ expiryDate: day(0) }))).not.toThrow(); // expires today: still usable today
  });
  it("the category only gives the default for a new item", () => {
    for (const category of ["Dairy", "Vegetables", "Fruits", "Meat & Poultry", "Seafood"]) expect(defaultTracksExpiry(category)).toBe(true);
    expect(defaultTracksExpiry("Grains & Cereals")).toBe(false);
  });
});
