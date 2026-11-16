import { describe, expect, it } from "vitest";
import { parseProductBillingProfileConflict, parseProductBillingProfileRequest, parseProductCounterRequest, PLATFORM_PRODUCT_BILLING_PROFILES_PATH_PATTERN } from "../index";

const fields = { name: "Spice Route", contactName: "Asha", contactEmail: "a@example.com", contactPhone: "9876543210", addressLine1: "1 MG Road", city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India", gstin: "27aapfu0939f1zv", website: "https://spice.example" };

describe("product billing profile contract", () => {
  it("accepts a save, upper-cases the GSTIN and fills missing optional fields with null", () => {
    const r = parseProductBillingProfileRequest({ baseVersion: null, source: "account", fields });
    expect(r.ok && r.value.fields?.gstin).toBe("27AAPFU0939F1ZV");
    expect(r.ok && r.value.fields?.logoUrl).toBeNull();
  });
  it("accepts a copy and refuses bad versions, sources, links and details", () => {
    expect(parseProductBillingProfileRequest({ baseVersion: 3, source: "product", copyFrom: "rivo" }).ok).toBe(true);
    for (const bad of [{ baseVersion: 0 }, { baseVersion: "1" }, { source: "staff" }, { fields: { ...fields, website: "javascript:x" } }, { fields: { ...fields, postalCode: "12" } }, { copyFrom: "Bad Key" }]) {
      expect(parseProductBillingProfileRequest({ baseVersion: null, source: "account", fields, ...bad }).ok).toBe(false);
    }
  });
  it("reads a conflict answer and matches only the two real routes", () => {
    expect(parseProductBillingProfileConflict({ current: null })).toEqual({ ok: true, value: { current: null } });
    expect(parseProductBillingProfileConflict({}).ok).toBe(false);
    const biz = `biz_${"a".repeat(32)}`;
    expect(PLATFORM_PRODUCT_BILLING_PROFILES_PATH_PATTERN.test(`/api/platform/businesses/${biz}/billing-profiles`)).toBe(true);
    expect(PLATFORM_PRODUCT_BILLING_PROFILES_PATH_PATTERN.test(`/api/platform/businesses/${biz}/billing-profiles/caterly`)).toBe(true);
    expect(PLATFORM_PRODUCT_BILLING_PROFILES_PATH_PATTERN.test(`/api/platform/businesses/${biz}/billing-profiles/caterly/history`)).toBe(true);
    expect(PLATFORM_PRODUCT_BILLING_PROFILES_PATH_PATTERN.test(`/api/platform/businesses/${biz}/billing-profiles/caterly/x`)).toBe(false);
  });

  it("order numbering is all three fields or none: a short prefix, a next number from 1 and 1 to 10 digits; the prefix is stored in capitals", () => {
    const numbered = { ...fields, orderNumberPrefix: "sr", orderNumberNextValue: "42", orderNumberPadding: "4" };
    const ok = parseProductBillingProfileRequest({ baseVersion: null, source: "account", fields: numbered });
    expect(ok.ok && ok.value.fields).toMatchObject({ orderNumberPrefix: "SR", orderNumberNextValue: "42", orderNumberPadding: "4" });
    expect(parseProductBillingProfileRequest({ baseVersion: null, source: "account", fields }).ok).toBe(true);
    for (const bad of [{ orderNumberPrefix: "SR" }, { ...numbered, orderNumberPrefix: "bad prefix!" }, { ...numbered, orderNumberNextValue: "0" }, { ...numbered, orderNumberNextValue: "1.5" }, { ...numbered, orderNumberPadding: "11" }, { ...numbered, orderNumberPadding: "0" }]) {
      expect(parseProductBillingProfileRequest({ baseVersion: null, source: "account", fields: { ...fields, ...bad } }).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("the live order counter is its own request: a number from 1, optionally seeding the prefix and digits", () => {
    expect(parseProductCounterRequest({ baseVersion: null, fields })).toBeNull();
    expect(parseProductCounterRequest({ counter: { orderNumberNextValue: "7" } })).toEqual({ ok: true, value: { orderNumberNextValue: "7" } });
    expect(parseProductCounterRequest({ counter: { orderNumberNextValue: "7", orderNumberPrefix: "sr", orderNumberPadding: "4" } })).toEqual({ ok: true, value: { orderNumberNextValue: "7", orderNumberPrefix: "SR", orderNumberPadding: "4" } });
    for (const bad of [{ orderNumberNextValue: "0" }, { orderNumberNextValue: 7 }, {}, { orderNumberNextValue: "7", orderNumberPrefix: "SR" }]) expect(parseProductCounterRequest({ counter: bad })?.ok, JSON.stringify(bad)).toBe(false);
  });
});
