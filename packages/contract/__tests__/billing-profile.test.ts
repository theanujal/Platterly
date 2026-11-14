import { describe, expect, it } from "vitest";
import type { Buyer } from "../src/billing";
import { checkBuyer, parseBillingProfileAnswer, parseBillingProfileRequest } from "../src/billing-profile";

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

describe("billing profile request", () => {
  it("accepts good details, trims them and saves the GSTIN in capitals", () => {
    const parsed = parseBillingProfileRequest({ buyer: { ...good, name: "  Spice Route Caterers ", gstin: " 27aapfu0939f1zv " } });
    expect(parsed).toEqual({ ok: true, value: { buyer: { ...good, gstin: "27AAPFU0939F1ZV" } } });
  });

  it("carries who made the change when it is given, and refuses one that is not short text", () => {
    expect(parseBillingProfileRequest({ buyer: good, editedBy: "user-123" })).toEqual({ ok: true, value: { buyer: good, editedBy: "user-123" } });
    expect(parseBillingProfileRequest({ buyer: good, editedBy: 5 }).ok).toBe(false);
    expect(parseBillingProfileRequest({ buyer: good, editedBy: "x".repeat(101) }).ok).toBe(false);
  });

  it("refuses anything that is not an object with a buyer", () => {
    for (const bad of [null, "x", [], {}, { buyer: null }, { buyer: "x" }]) expect(parseBillingProfileRequest(bad).ok).toBe(false);
  });

  it("refuses details that fail the checks, naming the first problem, so a hand-made request cannot save a bad GSTIN or PIN", () => {
    const badGstin = parseBillingProfileRequest({ buyer: { ...good, gstin: "123" } });
    expect(badGstin.ok).toBe(false);
    if (!badGstin.ok) expect(badGstin.error).toMatch(/gstin/i);
    expect(parseBillingProfileRequest({ buyer: { ...good, postalCode: "12" } }).ok).toBe(false);
    expect(parseBillingProfileRequest({ buyer: { ...good, addressLine1: "" } }).ok).toBe(false);
  });
});

describe("billing profile answer", () => {
  it("accepts saved details with their time, and the empty answer for a business with none", () => {
    expect(parseBillingProfileAnswer({ profile: good, updatedAt: "2026-11-14T10:00:00.000Z" })).toEqual({ ok: true, value: { profile: good, updatedAt: "2026-11-14T10:00:00.000Z" } });
    expect(parseBillingProfileAnswer({ profile: null, updatedAt: null })).toEqual({ ok: true, value: { profile: null, updatedAt: null } });
  });

  it("refuses anything else, so a wrong or tampered answer is never believed", () => {
    for (const bad of [null, "x", {}, { profile: null }, { profile: "x", updatedAt: null }, { profile: { ...good, name: "" }, updatedAt: null }, { profile: good, updatedAt: "yesterday" }, { profile: null, updatedAt: 5 }]) {
      expect(parseBillingProfileAnswer(bad).ok).toBe(false);
    }
  });
});
