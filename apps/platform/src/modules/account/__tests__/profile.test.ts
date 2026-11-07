import { describe, expect, it } from "vitest";
import { validateProfile } from "../profile";

describe("validateProfile", () => {
  it("tidies a name and a phone number", () => {
    expect(validateProfile({ firstName: "  Asha ", lastName: "Rao  Nair", phone: "+91 98000 00123" })).toEqual({ ok: true, clean: { firstName: "Asha", lastName: "Rao Nair", phone: "+919800000123" } });
  });
  it("a number without a country code is read as Indian; only the fields given are checked", () => {
    expect(validateProfile({ phone: "98000 00123" })).toEqual({ ok: true, clean: { phone: "+919800000123" } });
    expect(validateProfile({})).toEqual({ ok: true, clean: {} });
  });
  it("refuses an empty, over-long or markup name, an empty phone (it is required), a bad phone, an unknown time zone and a non-boolean choice", () => {
    for (const bad of [{ firstName: "" }, { lastName: "  " }, { firstName: "x".repeat(41) }, { lastName: "<b>x</b>" }, { firstName: 5 }, { phone: "" }, { phone: "12ab" }, { phone: "123" }, { phone: 5 }, { timeZone: "Mars/Base" }, { timeZone: 1 }, { notifyProductUpdates: "yes" }]) {
      expect(validateProfile(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it("accepts a real time zone", () => {
    expect(validateProfile({ timeZone: "Asia/Dubai", notifyProductUpdates: true })).toEqual({ ok: true, clean: { timeZone: "Asia/Dubai", notifyProductUpdates: true } });
  });
});
