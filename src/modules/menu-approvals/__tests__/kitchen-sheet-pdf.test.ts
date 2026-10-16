import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { buildKitchenSheetPdf, type KitchenSheetInput, type KitchenSheetMeal } from "../kitchen-sheet-pdf";
import { DEFAULT_KITCHEN_SHEET_TEXT, textToPoints } from "@/modules/kitchen/sheet-text";

const meal = (title: string, overrides: Partial<KitchenSheetMeal> = {}): KitchenSheetMeal => ({
  title,
  dayLabel: null,
  dateText: "Sat, 31 Oct 2026",
  pickup: "10:00 AM",
  totalGuests: 90,
  adults: 65,
  under5: 5,
  age5to10: 20,
  cookFor: 99,
  extraPercent: 10,
  menuName: "North Indian Menu",
  categories: [
    { name: "Welcome Drink", items: ["Jaljeera"] },
    { name: "Soup", items: ["Tomato Soup"] },
    { name: "Starter", items: ["Paneer Tikka", "Hara Bhara Kebab", "Chilli Chicken"] },
    { name: "Main Dish", items: ["Dal Makhani", "Paneer Butter Masala", "Veg Biryani"] },
    { name: "Indian Bread", items: ["Butter Naan", "Tandoori Roti"] },
    { name: "Dessert", items: ["Gulab Jamun", "Ice cream"] },
  ],
  extras: ["Chaat Counter"],
  ...overrides,
});

const input = (meals: KitchenSheetMeal[], extra: Partial<KitchenSheetInput> = {}): KitchenSheetInput => ({
  kitchen: { name: "Platterly Demo Kitchen", address: "FF1, 4th Floor, #14, 7th Cross Road, Muneshwar Nagara, Bangalore, Karnataka", phone: "+91 98765 43210" },
  orderNumber: "ORD-0007",
  bookingDate: "Sat, 17 Oct 2026",
  customerName: "Anoop Jalota",
  eventType: "Wedding",
  notes: "Jain food to be cooked separately.",
  serviceIncludes: textToPoints(DEFAULT_KITCHEN_SHEET_TEXT.serviceIncludes),
  pleaseNote: textToPoints(DEFAULT_KITCHEN_SHEET_TEXT.pleaseNote),
  meals,
  ...extra,
});

/** jsPDF writes its text streams uncompressed, so the words can be looked for in the file. */
const text = (doc: ReturnType<typeof buildKitchenSheetPdf>) => Buffer.from(doc.output("arraybuffer")).toString("latin1");

describe("kitchen sheet PDF", () => {
  it("makes one A4 page per meal, in the kitchen's sheet format", () => {
    const doc = buildKitchenSheetPdf(input([meal("Lunch"), meal("Dinner", { dayLabel: "Day 2" })]));
    expect(doc.getNumberOfPages()).toBe(2);
    const pdf = text(doc);
    expect(pdf.startsWith("%PDF")).toBe(true);
    for (const word of ["Platterly Demo Kitchen", "LUNCH", "DINNER", "Booking Date", "Food Pickup from Kitchen", "Total Guests", "Adults - 65", "Under 5 Years - 5", "5 to 10 Years - 20", "Selected Menu", "North Indian Menu", "Starter", "Hara Bhara Kebab", "Service Also Include", "Please Note", "Chaat Counter", "Jain food", "Page 2 of 2"]) {
      expect(pdf).toContain(word);
    }
  });

  it("is for the kitchen only: no contact number, payments, prices, transport or GST", () => {
    const pdf = text(buildKitchenSheetPdf(input([meal("Lunch")])));
    for (const word of ["Contact Number", "Advance Paid", "Pax Price", "Transportation", "GST", "Rs ", "88607"]) expect(pdf).not.toContain(word);
  });

  it("leaves a block out when the kitchen's text for it is empty, and prints the kitchen's own wording otherwise", () => {
    const own = text(buildKitchenSheetPdf(input([meal("Lunch", { extras: [] })], { serviceIncludes: ["Our own service point"], pleaseNote: [] })));
    expect(own).toContain("Our own service point");
    expect(own).toContain("Service Also Include");
    expect(own).not.toContain("Please Note");
    expect(own).not.toContain("Bisleri");
    const none = text(buildKitchenSheetPdf(input([meal("Lunch", { extras: [] })], { serviceIncludes: [], pleaseNote: [] })));
    expect(none).not.toContain("Service Also Include");
  });

  it("turns a typed block into points: one per line, numbers and bullets dropped", () => {
    expect(textToPoints("1. Staff for service\n- Melamine plates\n\n  • Cutlery\r\n2) Tables")).toEqual(["Staff for service", "Melamine plates", "Cutlery", "Tables"]);
  });

  it("runs a very long menu on to more pages instead of cutting it off", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Category ${i + 1}`, items: Array.from({ length: 12 }, (_, j) => `Dish number ${i + 1}-${j + 1}`) }));
    const doc = buildKitchenSheetPdf(input([meal("Lunch", { categories: many })]));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(text(doc)).toContain("Dish number 12-12");
  });

  it("copes with an order that has no dishes yet", () => {
    const doc = buildKitchenSheetPdf(input([meal("Lunch", { categories: [], extras: [], menuName: null, pickup: null })], { notes: null }));
    expect(doc.getNumberOfPages()).toBe(1);
    expect(text(doc)).toContain("No dishes selected yet.");
  });

  it("still prints a page for an order with no meals planned", () => {
    const doc = buildKitchenSheetPdf(input([]));
    expect(doc.getNumberOfPages()).toBe(1);
    expect(text(doc)).toContain("No meals have been planned");
  });

  it.skipIf(!process.env.KITCHEN_SHEET_PREVIEW)("writes a preview file when asked", () => {
    writeFileSync(process.env.KITCHEN_SHEET_PREVIEW!, Buffer.from(buildKitchenSheetPdf(input([meal("Lunch")])).output("arraybuffer")));
  });
});
