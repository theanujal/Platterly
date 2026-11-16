import { describe, expect, it } from "vitest";
import type { Buyer } from "../src/billing";
import { checkBuyer } from "../src/billing-profile";

const good: Buyer = { name: "Spice Route Caterers", addressLine1: "12 MG Road", addressLine2: null, city: "Pune", state: "Maharashtra", postalCode: "411001", country: null, gstin: null };

describe("billing profile checks", () => {
  it("a complete set of details has no problems, with or without a GSTIN", () => {
    expect(checkBuyer(good)).toEqual({});
    expect(checkBuyer({ ...good, gstin: "27AAPFU0939F1ZV" })).toEqual({});
  });

  it("names every missing or malformed field", () => {
    const errors = checkBuyer({ ...good, name: " ", addressLine1: null, city: "", state: null, postalCode: "4110", gstin: "NOT-A-GSTIN" });
    expect(Object.keys(errors).sort()).toEqual(["addressLine1", "city", "gstin", "name", "postalCode", "state"]);
  });

  it("a GSTIN is accepted in lower case, and a PIN code must be exactly six digits", () => {
    expect(checkBuyer({ ...good, gstin: "27aapfu0939f1zv" })).toEqual({});
    expect(checkBuyer({ ...good, postalCode: "4110011" }).postalCode).toBeDefined();
    expect(checkBuyer({ ...good, postalCode: "41100A" }).postalCode).toBeDefined();
  });
});
