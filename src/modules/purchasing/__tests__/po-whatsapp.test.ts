import { describe, it, expect } from "vitest";
import { buildPoWhatsappMessage, whatsappOrderLink } from "../po-whatsapp";
import { isPriced } from "../po-math";

const lines = [
  { name: "Mutton (Bone-in)", quantity: 33, unit: "kg" },
  { name: "Chicken (Boneless)", quantity: 10, unit: "kg" },
];

describe("purchase order WhatsApp message", () => {
  it("lists the supplier, number, items and units, asks for confirmation, and has no prices", () => {
    const message = buildPoWhatsappMessage({ supplierName: "Sujatha Meet Shop", number: "PO-0003", lines });
    expect(message).toBe(
      [
        "Hello Sujatha Meet Shop,",
        "",
        "Please confirm availability for the following purchase order.",
        "",
        "Purchase Order: PO-0003",
        "",
        "• Mutton (Bone-in) — 33 kg",
        "• Chicken (Boneless) — 10 kg",
        "",
        "Please confirm availability and expected delivery.",
        "",
        "Thank you.",
      ].join("\n"),
    );
    expect(message).not.toMatch(/₹|price|cost/i);
  });

  it("writes decimal quantities without trailing zeros", () => {
    const message = buildPoWhatsappMessage({ supplierName: "S", number: "PO-1", lines: [{ name: "Oil", quantity: 2.5, unit: "ltr" }, { name: "Salt", quantity: 0.1 + 0.2, unit: "kg" }] });
    expect(message).toContain("• Oil — 2.5 ltr");
    expect(message).toContain("• Salt — 0.3 kg");
  });
});

describe("WhatsApp click-to-chat link", () => {
  const message = "Hello A & B,\n\n• Item — 3 kg";
  it("uses the saved number in international form and URL-encodes the message", () => {
    const link = whatsappOrderLink("+919876543210", message)!;
    expect(link.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    expect(decodeURIComponent(link.split("?text=")[1])).toBe(message);
    expect(link).not.toContain("\n");
  });
  it("does not prepend a country code that is already there, and reads a bare Indian number as +91", () => {
    expect(whatsappOrderLink("+91 98765 43210", "x")).toContain("wa.me/919876543210?");
    expect(whatsappOrderLink("9876543210", "x")).toContain("wa.me/919876543210?");
    expect(whatsappOrderLink("+86 138 1234 5678", "x")).toContain("wa.me/8613812345678?");
  });
  it("is null for a missing or invalid number", () => {
    expect(whatsappOrderLink(null, "x")).toBeNull();
    expect(whatsappOrderLink("", "x")).toBeNull();
    expect(whatsappOrderLink("12345", "x")).toBeNull();
    expect(whatsappOrderLink("+91 12345", "x")).toBeNull();
  });
});

describe("priced orders", () => {
  it("an order with no unit costs is not priced yet", () => {
    expect(isPriced([{ quantity: 5, receivedQuantity: 0, unitCost: 0 }])).toBe(false);
    expect(isPriced([{ quantity: 5, receivedQuantity: 0, unitCost: 0 }, { quantity: 1, receivedQuantity: 0, unitCost: 40 }])).toBe(true);
  });
});
