import { describe, expect, it } from "vitest";
import { isStandFulfilment, parseShipTo, parseStandCheckoutRequest, STAND_FULFILMENT, STAND_MAX_PER_ORDER } from "../index";

const buyer = { name: "Spice Route", addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, country: null, gstin: null };
const shipTo = { name: "Asha", phone: "+919876543210", addressLine1: "1 Main Rd", addressLine2: null, city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India" };
const good = { quantity: 2, shipTo, buyer, kitchenName: "Spice Route", kitchenLogoUrl: null, linkUrl: "https://catering.platterly.in/spice-route" };

describe("Order QR stand (contract section 33)", () => {
  it("allows 1 to 3 stands and nothing else", () => {
    expect(STAND_MAX_PER_ORDER).toBe(3);
    for (const q of [1, 2, 3]) expect(parseStandCheckoutRequest({ ...good, quantity: q }).ok).toBe(true);
    for (const q of [0, 4, 1.5, "2", null]) expect(parseStandCheckoutRequest({ ...good, quantity: q }).ok).toBe(false);
  });

  it("needs a full ship-to address, a valid phone and PIN, and trims text", () => {
    expect(parseShipTo(shipTo).ok).toBe(true);
    expect(parseShipTo({ ...shipTo, name: "  Asha  " })).toMatchObject({ ok: true, value: { name: "Asha" } });
    for (const field of ["name", "phone", "addressLine1", "city", "state", "postalCode"] as const) expect(parseShipTo({ ...shipTo, [field]: "" }).ok, field).toBe(false);
    expect(parseShipTo({ ...shipTo, phone: "abc" }).ok).toBe(false);
    expect(parseShipTo({ ...shipTo, postalCode: "!!" }).ok).toBe(false);
    expect(parseShipTo({ ...shipTo, addressLine2: "x".repeat(300) }).ok).toBe(false);
    expect(parseShipTo("nope").ok).toBe(false);
  });

  it("needs the link the QR will encode to be a web address, and the kitchen's name", () => {
    expect(parseStandCheckoutRequest({ ...good, linkUrl: "javascript:alert(1)" }).ok).toBe(false);
    expect(parseStandCheckoutRequest({ ...good, linkUrl: "" }).ok).toBe(false);
    expect(parseStandCheckoutRequest({ ...good, kitchenName: "" }).ok).toBe(false);
    expect(parseStandCheckoutRequest({ ...good, kitchenLogoUrl: "https://x.example/logo.webp" }).ok).toBe(true);
    expect(parseStandCheckoutRequest({ ...good, buyer: { name: "" } }).ok).toBe(false);
  });

  it("fulfilment goes Placed, Printing, Shipped, Delivered", () => {
    expect([...STAND_FULFILMENT]).toEqual(["PLACED", "PRINTING", "SHIPPED", "DELIVERED"]);
    expect(isStandFulfilment("SHIPPED")).toBe(true);
    expect(isStandFulfilment("LOST")).toBe(false);
  });
});
